/**
 * Server-side organization provisioning and membership helpers.
 */
import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/db/pool";
import {
  canMutateRun,
  inviteExpiresAt,
  parseInviteInput,
  uniqueSlug,
  VIEWER_MUTATION_DENIED,
  type OrganizationKind,
  type OrganizationRole,
  type WorkspaceRole,
} from "@/lib/organizations";

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newInviteToken() {
  return randomBytes(32).toString("hex");
}

/** Create org + owner membership + default workspace; set profile current context. */
export async function provisionOrganizationForUser(opts: {
  userId: string;
  orgName: string;
  kind: OrganizationKind;
  workspaceName?: string;
}): Promise<{ organizationId: string; workspaceId: string }> {
  const sql = getSql();
  const orgSlug = uniqueSlug(opts.orgName, opts.userId);
  const orgs = await sql`
    INSERT INTO organizations (name, slug, kind, created_by)
    VALUES (${opts.orgName}, ${orgSlug}, ${opts.kind}, ${opts.userId})
    RETURNING id
  `;
  const organizationId = orgs[0].id as string;

  await sql`
    INSERT INTO organization_members (organization_id, user_id, role)
    VALUES (${organizationId}, ${opts.userId}, 'owner'::organization_role)
  `;

  const wsName = opts.workspaceName ?? `${opts.orgName} workspace`;
  const wsSlug = uniqueSlug(wsName, organizationId);
  const workspaces = await sql`
    INSERT INTO workspaces (name, slug, owner_id, organization_id)
    VALUES (${wsName}, ${wsSlug}, ${opts.userId}, ${organizationId})
    RETURNING id
  `;
  const workspaceId = workspaces[0].id as string;

  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (${workspaceId}, ${opts.userId}, 'owner'::workspace_role)
  `;

  await sql`
    UPDATE profiles
    SET current_organization_id = ${organizationId},
        current_workspace_id = ${workspaceId}
    WHERE id = ${opts.userId}
  `;

  return { organizationId, workspaceId };
}

export async function assertOrgMembership(
  userId: string,
  organizationId: string,
  roles?: OrganizationRole[],
): Promise<{ role: OrganizationRole }> {
  const sql = getSql();
  const rows = await sql`
    SELECT role FROM organization_members
    WHERE organization_id = ${organizationId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!rows.length) throw new Error("Not an organization member");
  const role = rows[0].role as OrganizationRole;
  if (roles && !roles.includes(role)) {
    throw new Error("Insufficient organization role");
  }
  return { role };
}

export async function countOrgOwners(organizationId: string): Promise<number> {
  const sql = getSql();
  const rows = await sql`
    SELECT count(*)::int AS c FROM organization_members
    WHERE organization_id = ${organizationId} AND role = 'owner'
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function recordOrgAudit(opts: {
  organizationId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  event: string;
  targetEmail?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO organization_audit_events (
        organization_id, actor_user_id, actor_email, event, target_email, meta
      )
      VALUES (
        ${opts.organizationId},
        ${opts.actorUserId ?? null},
        ${opts.actorEmail ?? null},
        ${opts.event},
        ${opts.targetEmail ?? null},
        ${JSON.stringify(opts.meta ?? {})}::jsonb
      )
    `;
  } catch (err) {
    console.warn("organization_audit_events insert failed", err);
  }
}

export async function assertCanMutateWorkspaceWork(
  userId: string,
  workspaceId: string,
): Promise<{ role: WorkspaceRole }> {
  const sql = getSql();
  const rows = await sql`
    SELECT role FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (!rows.length) throw new Error("Not a workspace member");
  const role = rows[0].role as WorkspaceRole;
  if (!canMutateRun(role)) throw new Error(VIEWER_MUTATION_DENIED);
  return { role };
}

export async function assertCanMutateRun(
  userId: string,
  runId: string,
): Promise<{ workspaceId: string; role: WorkspaceRole }> {
  const sql = getSql();
  const runs = await sql`
    SELECT workspace_id FROM runs WHERE id = ${runId} LIMIT 1
  `;
  if (!runs.length) throw new Error("Run not found");
  const workspaceId = runs[0].workspace_id as string;
  const { role } = await assertCanMutateWorkspaceWork(userId, workspaceId);
  return { workspaceId, role };
}

export async function createOrganizationInvite(opts: {
  organizationId: string;
  email: string;
  role: OrganizationRole;
  invitedBy: string;
  workspaceIds?: string[];
  workspaceRole?: WorkspaceRole;
  allowOwnerInvite?: boolean;
  skipMembershipCheck?: boolean;
  grantPlatformAdmin?: boolean;
}): Promise<{ token: string; inviteId: string; expiresAt: Date }> {
  if (opts.role === "owner" && !opts.allowOwnerInvite) {
    throw new Error("Cannot invite as owner — transfer ownership instead");
  }
  if (!opts.allowOwnerInvite && !opts.skipMembershipCheck) {
    await assertOrgMembership(opts.invitedBy, opts.organizationId, ["owner", "admin"]);
  }

  const sql = getSql();
  const email = opts.email.trim().toLowerCase();
  const token = newInviteToken();
  const expiresAt = inviteExpiresAt(14);
  const workspaceRole = opts.workspaceRole ?? (opts.role === "admin" ? "admin" : "reviewer");

  const workspaceIds = [...new Set(opts.workspaceIds ?? [])];
  if (workspaceIds.length) {
    const ok = await sql`
      SELECT id FROM workspaces
      WHERE organization_id = ${opts.organizationId}
        AND id = ANY(${workspaceIds}::uuid[])
    `;
    if (ok.length !== workspaceIds.length) {
      throw new Error("Invite must name workspaces in this organization");
    }
  }

  // Revoke prior pending invites for same email+org
  await sql`
    UPDATE organization_invites
    SET revoked_at = now()
    WHERE organization_id = ${opts.organizationId}
      AND lower(email) = ${email}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
  `;

  const rows = await sql`
    INSERT INTO organization_invites (
      organization_id, email, role, workspace_role, token_hash, invited_by, expires_at, grant_platform_admin
    )
    VALUES (
      ${opts.organizationId},
      ${email},
      ${opts.role}::organization_role,
      ${workspaceRole}::workspace_role,
      ${hashInviteToken(token)},
      ${opts.invitedBy},
      ${expiresAt},
      ${Boolean(opts.grantPlatformAdmin)}
    )
    RETURNING id
  `;
  const inviteId = rows[0].id as string;

  for (const workspaceId of workspaceIds) {
    await sql`
      INSERT INTO organization_invite_workspaces (invite_id, workspace_id, workspace_role)
      VALUES (${inviteId}, ${workspaceId}, ${workspaceRole}::workspace_role)
      ON CONFLICT DO NOTHING
    `;
  }

  return { token, inviteId, expiresAt };
}

/** GPT-Lab creates a customer org and an owner invite. Staff are not added as members. */
export async function provisionOrganizationForOwnerInvite(opts: {
  name: string;
  ownerEmail: string;
  createdBy: string;
  workspaceName?: string;
}): Promise<{
  organizationId: string;
  workspaceId: string;
  token: string;
  inviteId: string;
  expiresAt: Date;
}> {
  const sql = getSql();
  const orgName = opts.name.trim();
  const orgSlug = uniqueSlug(orgName, opts.createdBy);
  const orgs = await sql`
    INSERT INTO organizations (name, slug, kind, created_by)
    VALUES (${orgName}, ${orgSlug}, 'company', ${opts.createdBy})
    RETURNING id
  `;
  const organizationId = orgs[0].id as string;

  const wsName = (opts.workspaceName ?? "General").trim() || "General";
  const wsSlug = uniqueSlug(wsName, organizationId);
  const workspaces = await sql`
    INSERT INTO workspaces (name, slug, owner_id, organization_id)
    VALUES (${wsName}, ${wsSlug}, ${opts.createdBy}, ${organizationId})
    RETURNING id
  `;
  const workspaceId = workspaces[0].id as string;

  const invite = await createOrganizationInvite({
    organizationId,
    email: opts.ownerEmail,
    role: "owner",
    invitedBy: opts.createdBy,
    workspaceIds: [workspaceId],
    workspaceRole: "owner",
    allowOwnerInvite: true,
  });

  await recordOrgAudit({
    organizationId,
    actorUserId: opts.createdBy,
    event: "org_provisioned",
    targetEmail: opts.ownerEmail.trim().toLowerCase(),
    meta: { workspaceId },
  });

  return { organizationId, workspaceId, ...invite };
}

/** Mint a fresh owner join link. Plain tokens are not stored, so GPT-Lab recopies by reissuing. */
export async function reissueOwnerInvite(opts: {
  organizationId: string;
  actorUserId: string;
}): Promise<{ acceptUrl: string; email: string }> {
  const sql = getSql();
  const pending = await sql`
    SELECT id, email
    FROM organization_invites
    WHERE organization_id = ${opts.organizationId}
      AND role = 'owner'
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = pending[0];
  if (!row) throw new Error("No pending owner invite for this organization");

  const named = await sql`
    SELECT workspace_id FROM organization_invite_workspaces WHERE invite_id = ${row.id}
  `;
  let workspaceIds = named.map((r: { workspace_id: string }) => r.workspace_id);
  if (!workspaceIds.length) {
    const ws = await sql`
      SELECT id FROM workspaces
      WHERE organization_id = ${opts.organizationId}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (ws[0]?.id) workspaceIds = [ws[0].id as string];
  }

  const invite = await createOrganizationInvite({
    organizationId: opts.organizationId,
    email: row.email as string,
    role: "owner",
    invitedBy: opts.actorUserId,
    workspaceIds,
    workspaceRole: "owner",
    allowOwnerInvite: true,
  });
  await recordOrgAudit({
    organizationId: opts.organizationId,
    actorUserId: opts.actorUserId,
    event: "owner_invite_reissued",
    targetEmail: String(row.email).toLowerCase(),
  });
  const { inviteAcceptUrl } = await import("@/lib/mailer.server");
  return { acceptUrl: inviteAcceptUrl(invite.token), email: row.email as string };
}

type InviteRecord = {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  workspace_role?: string | null;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  revoked_at: Date | string | null;
  grant_platform_admin?: boolean;
};

function assertInviteOpen(invite: InviteRecord | undefined): asserts invite is InviteRecord {
  if (!invite) throw new Error("Invite not found");
  if (invite.accepted_at) throw new Error("Invite already accepted");
  if (invite.revoked_at) throw new Error("Invite was revoked");
  if (new Date(invite.expires_at) < new Date()) throw new Error("Invite expired");
}

export async function findPendingInviteByEmail(email: string): Promise<InviteRecord | null> {
  const sql = getSql();
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await sql`
    SELECT id, organization_id, email, role, workspace_role, expires_at, accepted_at, revoked_at, grant_platform_admin
    FROM organization_invites
    WHERE lower(email) = ${normalized}
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as InviteRecord | undefined) ?? null;
}

async function applyOrganizationInvite(opts: {
  invite: InviteRecord;
  userId: string;
  userEmail: string;
}): Promise<{ organizationId: string; workspaceId: string | null }> {
  const sql = getSql();
  const invite = opts.invite;
  const inviteEmail = String(invite.email).trim().toLowerCase();
  const userEmail = opts.userEmail.trim().toLowerCase();
  if (inviteEmail !== userEmail) {
    throw new Error("Sign in with the invited email address to accept");
  }

  const organizationId = invite.organization_id;
  const role = invite.role as OrganizationRole;
  const named = await sql`
    SELECT workspace_id, workspace_role
    FROM organization_invite_workspaces
    WHERE invite_id = ${invite.id}
  `;
  const fallbackRole = (invite.workspace_role as WorkspaceRole | null)
    ?? (role === "owner" ? "owner" : role === "admin" ? "admin" : "reviewer");

  let targets: { workspace_id: string; workspace_role: WorkspaceRole }[] = named.map(
    (r: { workspace_id: string; workspace_role?: WorkspaceRole | null }) => ({
      workspace_id: r.workspace_id,
      workspace_role: r.workspace_role ?? fallbackRole,
    }),
  );
  if (!targets.length) {
    const workspaces = await sql`
      SELECT id FROM workspaces
      WHERE organization_id = ${organizationId}
      ORDER BY created_at ASC
      LIMIT 1
    `;
    if (workspaces[0]?.id) {
      targets = [{ workspace_id: workspaces[0].id as string, workspace_role: fallbackRole }];
    }
  }

  await sql`
    INSERT INTO organization_members (organization_id, user_id, role, invited_by)
    VALUES (
      ${organizationId},
      ${opts.userId},
      ${role}::organization_role,
      ${null}
    )
    ON CONFLICT (organization_id, user_id) DO UPDATE SET
      role = CASE
        WHEN organization_members.role = 'owner'::organization_role THEN organization_members.role
        WHEN EXCLUDED.role = 'owner'::organization_role THEN EXCLUDED.role
        ELSE organization_members.role
      END,
      updated_at = now()
  `;

  for (const target of targets) {
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
      VALUES (${target.workspace_id}, ${opts.userId}, ${target.workspace_role}::workspace_role, NULL)
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `;
    if (role === "owner") {
      await sql`
        UPDATE workspaces SET owner_id = ${opts.userId}
        WHERE id = ${target.workspace_id} AND organization_id = ${organizationId}
      `;
    }
  }

  const workspaceId = targets[0]?.workspace_id ?? null;

  await sql`
    UPDATE organization_invites SET accepted_at = now() WHERE id = ${invite.id}
  `;

  await sql`
    UPDATE profiles
    SET current_organization_id = ${organizationId},
        current_workspace_id = COALESCE(${workspaceId}, current_workspace_id)
    WHERE id = ${opts.userId}
  `;

  await recordOrgAudit({
    organizationId,
    actorUserId: opts.userId,
    actorEmail: userEmail,
    event: "invite_accepted",
    targetEmail: inviteEmail,
    meta: { role, workspaceIds: targets.map((t) => t.workspace_id) },
  });

  if (invite.grant_platform_admin) {
    await sql`DELETE FROM user_roles WHERE user_id = ${opts.userId}`;
    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${opts.userId}, 'admin'::app_role)
    `;
  }

  const orgNameRow = await sql`SELECT name FROM organizations WHERE id = ${organizationId} LIMIT 1`;
  const { notifyPlatformAdmins, someoneJoinedNotice } = await import("@/lib/platform-notifications.server");
  const { saasRoleFromMembership, saasRoleLabelEn } = await import("@/lib/saas-roles");
  const saas = saasRoleFromMembership(role, invite.workspace_role ?? fallbackRole);
  const notice = someoneJoinedNotice({
    email: userEmail,
    orgName: String(orgNameRow[0]?.name ?? "an organization"),
    roleLabel: saasRoleLabelEn(saas),
  });
  await notifyPlatformAdmins({ ...notice, exceptUserId: opts.userId });

  return { organizationId, workspaceId };
}

export async function acceptOrganizationInvite(opts: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ organizationId: string; workspaceId: string | null }> {
  const sql = getSql();
  const tokenHash = hashInviteToken(parseInviteInput(opts.token));
  const invites = await sql`
    SELECT id, organization_id, email, role, workspace_role, expires_at, accepted_at, revoked_at, grant_platform_admin
    FROM organization_invites
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  const invite = invites[0] as InviteRecord | undefined;
  assertInviteOpen(invite);
  return applyOrganizationInvite({ invite, userId: opts.userId, userEmail: opts.userEmail });
}

/** Join the latest pending invite for this work email. No token required. */
export async function acceptPendingInviteForUser(opts: {
  userId: string;
  userEmail: string;
}): Promise<{ organizationId: string; workspaceId: string | null } | null> {
  const invite = await findPendingInviteByEmail(opts.userEmail);
  if (!invite) return null;
  return applyOrganizationInvite({ invite, userId: opts.userId, userEmail: opts.userEmail });
}

/** Ensure workspace belongs to an org the user is a member of. */
export async function assertWorkspaceInUserOrg(
  userId: string,
  workspaceId: string,
): Promise<{ organizationId: string }> {
  const sql = getSql();
  const rows = await sql`
    SELECT w.organization_id
    FROM workspaces w
    JOIN organization_members om
      ON om.organization_id = w.organization_id AND om.user_id = ${userId}
    JOIN workspace_members wm
      ON wm.workspace_id = w.id AND wm.user_id = ${userId}
    WHERE w.id = ${workspaceId}
    LIMIT 1
  `;
  if (!rows.length || !rows[0].organization_id) {
    throw new Error("Workspace not accessible in your organizations");
  }
  return { organizationId: rows[0].organization_id as string };
}
