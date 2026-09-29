import { getSql } from "@/db/pool";
import { normalizeOrgName } from "@/lib/access-requests";
import { inviteAcceptUrl } from "@/lib/mailer.server";
import { recordAuthEvent } from "@/lib/auth/events";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findOrganizationByName(name: string): Promise<{ id: string; name: string } | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name FROM organizations
    WHERE lower(name) = ${normalizeOrgName(name).toLowerCase()}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return { id: row.id as string, name: row.name as string };
}

async function inviteContactIntoOrganization(opts: {
  organizationId: string;
  email: string;
  invitedBy: string;
  skipMembershipCheck?: boolean;
}): Promise<{ token: string; acceptUrl: string }> {
  const sql = getSql();
  const { createOrganizationInvite } = await import("@/lib/organizations.server");
  const workspaces = await sql`
    SELECT id FROM workspaces
    WHERE organization_id = ${opts.organizationId}
    ORDER BY created_at ASC
  `;
  const invite = await createOrganizationInvite({
    organizationId: opts.organizationId,
    email: opts.email,
    role: "member",
    invitedBy: opts.invitedBy,
    workspaceIds: workspaces.map((w: { id: string }) => w.id),
    workspaceRole: "reviewer",
    skipMembershipCheck: opts.skipMembershipCheck,
  });
  return { token: invite.token, acceptUrl: inviteAcceptUrl(invite.token) };
}

export async function submitAccessRequest(opts: {
  organizationName: string;
  contactEmail: string;
  contactName: string;
  note?: string;
  ip?: string | null;
}): Promise<{ ok: true; alreadyPending?: boolean }> {
  const sql = getSql();
  const organizationName = normalizeOrgName(opts.organizationName);
  const contactEmail = opts.contactEmail.trim().toLowerCase();
  const contactName = opts.contactName.trim();
  const note = (opts.note ?? "").trim().slice(0, 500);
  if (organizationName.length < 2 || contactName.length < 1 || !EMAIL_RE.test(contactEmail)) {
    throw new Error("Check the organization name, your name, and a work email.");
  }

  const pending = await sql`
    SELECT id FROM access_requests
    WHERE status = 'pending'
      AND lower(contact_email) = ${contactEmail}
      AND lower(organization_name) = ${organizationName.toLowerCase()}
    LIMIT 1
  `;
  if (pending.length) {
    return { ok: true, alreadyPending: true };
  }

  const existingOrg = await findOrganizationByName(organizationName);

  await sql`
    INSERT INTO access_requests (
      organization_name, contact_email, contact_name, note, ip, status, organization_id
    )
    VALUES (
      ${organizationName},
      ${contactEmail},
      ${contactName},
      ${note},
      ${opts.ip ?? null},
      'pending',
      ${existingOrg?.id ?? null}
    )
  `;
  await recordAuthEvent({
    event: "access_requested",
    email: contactEmail,
    ip: opts.ip ?? null,
    meta: { organizationName },
  });
  return { ok: true };
}

export async function listPendingAccessRequests() {
  const sql = getSql();
  const rows = await sql`
    SELECT r.id, r.organization_name, r.contact_email, r.contact_name, r.note, r.status, r.created_at,
           COALESCE(r.organization_id, o.id) AS organization_id
    FROM access_requests r
    LEFT JOIN organizations o
      ON o.id = r.organization_id
      OR (r.organization_id IS NULL AND lower(o.name) = lower(r.organization_name))
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `;
  return rows.map((r: any) => ({
    id: r.id as string,
    organization_name: r.organization_name as string,
    contact_email: r.contact_email as string,
    contact_name: r.contact_name as string,
    note: (r.note as string) ?? "",
    status: r.status as string,
    created_at: r.created_at,
    organization_id: (r.organization_id as string | null) ?? null,
    existingOrganization: Boolean(r.organization_id),
  }));
}

export async function listPendingJoinRequestsForOrganization(organizationId: string) {
  const sql = getSql();
  const org = await sql`SELECT name FROM organizations WHERE id = ${organizationId} LIMIT 1`;
  if (!org[0]) throw new Error("Organization not found");
  const orgName = String(org[0].name);
  const rows = await sql`
    SELECT id, organization_name, contact_email, contact_name, note, status, created_at, organization_id
    FROM access_requests
    WHERE status = 'pending'
      AND (
        organization_id = ${organizationId}
        OR (organization_id IS NULL AND lower(organization_name) = ${orgName.toLowerCase()})
      )
    ORDER BY created_at ASC
  `;
  return rows.map((r: any) => ({
    id: r.id as string,
    organization_name: r.organization_name as string,
    contact_email: r.contact_email as string,
    contact_name: r.contact_name as string,
    note: (r.note as string) ?? "",
    status: r.status as string,
    created_at: r.created_at,
    organization_id: (r.organization_id as string | null) ?? organizationId,
    existingOrganization: true,
  }));
}

export async function approveAccessRequest(opts: {
  requestId: string;
  actorUserId: string;
  workspaceName?: string;
  asOrganizationId?: string;
}): Promise<{ acceptUrl: string; organizationId: string; kind: "join" | "new_org" }> {
  const sql = getSql();
  const { recordOrgAudit } = await import("@/lib/organizations.server");
  const rows = await sql`
    SELECT id, organization_name, contact_email, status, organization_id
    FROM access_requests
    WHERE id = ${opts.requestId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");

  const orgName = row.organization_name as string;
  const contactEmail = row.contact_email as string;
  const matched =
    (row.organization_id ? { id: row.organization_id as string, name: orgName } : null)
    ?? (await findOrganizationByName(orgName));

  if (opts.asOrganizationId) {
    if (!matched || matched.id !== opts.asOrganizationId) {
      throw new Error("This request is not for your organization");
    }
    const { assertOrgMembership } = await import("@/lib/organizations.server");
    await assertOrgMembership(opts.actorUserId, opts.asOrganizationId, ["owner", "admin"]);
  }

  let organizationId: string;
  let acceptUrl: string;
  let kind: "join" | "new_org";

  if (matched) {
    const invited = await inviteContactIntoOrganization({
      organizationId: matched.id,
      email: contactEmail,
      invitedBy: opts.actorUserId,
      skipMembershipCheck: !opts.asOrganizationId,
    });
    organizationId = matched.id;
    acceptUrl = invited.acceptUrl;
    kind = "join";
  } else {
    if (opts.asOrganizationId) {
      throw new Error("This request is not for your organization");
    }
    const { provisionOrganizationForOwnerInvite } = await import("@/lib/organizations.server");
    const provisioned = await provisionOrganizationForOwnerInvite({
      name: orgName,
      ownerEmail: contactEmail,
      createdBy: opts.actorUserId,
      workspaceName: opts.workspaceName,
    });
    organizationId = provisioned.organizationId;
    acceptUrl = inviteAcceptUrl(provisioned.token);
    kind = "new_org";
  }

  await sql`
    UPDATE access_requests
    SET status = 'approved',
        organization_id = ${organizationId},
        decided_by = ${opts.actorUserId},
        decided_at = now()
    WHERE id = ${opts.requestId}
  `;
  await recordAuthEvent({
    event: "access_approved",
    userId: opts.actorUserId,
    email: contactEmail,
    meta: { requestId: opts.requestId, organizationId, kind },
  });
  await recordOrgAudit({
    organizationId,
    actorUserId: opts.actorUserId,
    event: "access_approved",
    targetEmail: contactEmail,
    meta: { requestId: opts.requestId, kind },
  });
  return { acceptUrl, organizationId, kind };
}

export async function rejectAccessRequest(opts: {
  requestId: string;
  actorUserId: string;
  reason?: string;
  asOrganizationId?: string;
}): Promise<{ ok: true }> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, contact_email, organization_name, organization_id, status
    FROM access_requests
    WHERE id = ${opts.requestId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");
  if (opts.asOrganizationId) {
    const orgName = await sql`SELECT name FROM organizations WHERE id = ${opts.asOrganizationId} LIMIT 1`;
    const matchesId = row.organization_id === opts.asOrganizationId;
    const matchesName =
      orgName[0] && String(row.organization_name).toLowerCase() === String(orgName[0].name).toLowerCase();
    if (!matchesId && !matchesName) {
      throw new Error("This request is not for your organization");
    }
    const { assertOrgMembership } = await import("@/lib/organizations.server");
    await assertOrgMembership(opts.actorUserId, opts.asOrganizationId, ["owner", "admin"]);
  }
  const reason = (opts.reason ?? "").trim().slice(0, 300);
  await sql`
    UPDATE access_requests
    SET status = 'rejected',
        decided_by = ${opts.actorUserId},
        decided_at = now(),
        decision_note = ${reason}
    WHERE id = ${opts.requestId}
  `;
  await recordAuthEvent({
    event: "access_rejected",
    userId: opts.actorUserId,
    email: row.contact_email as string,
    meta: { requestId: opts.requestId, organizationName: row.organization_name, reason },
  });
  return { ok: true };
}
