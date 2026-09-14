import { getSql } from "@/db/pool";
import { normalizeOrgName } from "@/lib/access-requests";
import { inviteAcceptUrl } from "@/lib/mailer.server";
import { provisionOrganizationForOwnerInvite, recordOrgAudit } from "@/lib/organizations.server";
import { recordAuthEvent } from "@/lib/auth/events";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  await sql`
    INSERT INTO access_requests (
      organization_name, contact_email, contact_name, note, ip, status
    )
    VALUES (
      ${organizationName},
      ${contactEmail},
      ${contactName},
      ${note},
      ${opts.ip ?? null},
      'pending'
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
    SELECT id, organization_name, contact_email, contact_name, note, status, created_at
    FROM access_requests
    WHERE status = 'pending'
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
  }));
}

export async function approveAccessRequest(opts: {
  requestId: string;
  actorUserId: string;
  workspaceName?: string;
}): Promise<{ acceptUrl: string; organizationId: string }> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, organization_name, contact_email, status
    FROM access_requests
    WHERE id = ${opts.requestId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");

  const orgName = row.organization_name as string;
  const existing = await sql`
    SELECT id FROM organizations
    WHERE lower(name) = ${orgName.toLowerCase()}
    LIMIT 1
  `;
  if (existing.length) {
    throw new Error("An organization with this name is already on this instance");
  }

  const provisioned = await provisionOrganizationForOwnerInvite({
    name: orgName,
    ownerEmail: row.contact_email as string,
    createdBy: opts.actorUserId,
    workspaceName: opts.workspaceName,
  });

  await sql`
    UPDATE access_requests
    SET status = 'approved',
        organization_id = ${provisioned.organizationId},
        decided_by = ${opts.actorUserId},
        decided_at = now()
    WHERE id = ${opts.requestId}
  `;
  await recordAuthEvent({
    event: "access_approved",
    userId: opts.actorUserId,
    email: row.contact_email as string,
    meta: { requestId: opts.requestId, organizationId: provisioned.organizationId },
  });
  await recordOrgAudit({
    organizationId: provisioned.organizationId,
    actorUserId: opts.actorUserId,
    event: "access_approved",
    targetEmail: row.contact_email as string,
    meta: { requestId: opts.requestId },
  });
  return {
    acceptUrl: inviteAcceptUrl(provisioned.token),
    organizationId: provisioned.organizationId,
  };
}

export async function rejectAccessRequest(opts: {
  requestId: string;
  actorUserId: string;
  reason?: string;
}): Promise<{ ok: true }> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, contact_email, organization_name, status
    FROM access_requests
    WHERE id = ${opts.requestId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Request not found");
  if (row.status !== "pending") throw new Error("Request is no longer pending");
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
