/**
 * Server-side organization provisioning and membership helpers.
 */
import { createHash, randomBytes } from "node:crypto";
import { getSql } from "@/db/pool";
import {
  inviteExpiresAt,
  parseInviteInput,
  uniqueSlug,
  type OrganizationKind,
  type OrganizationRole,
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

export async function createOrganizationInvite(opts: {
  organizationId: string;
  email: string;
  role: OrganizationRole;
  invitedBy: string;
}): Promise<{ token: string; inviteId: string; expiresAt: Date }> {
  if (opts.role === "owner") throw new Error("Cannot invite as owner — transfer ownership instead");
  await assertOrgMembership(opts.invitedBy, opts.organizationId, ["owner", "admin"]);

  const sql = getSql();
  const email = opts.email.trim().toLowerCase();
  const token = newInviteToken();
  const expiresAt = inviteExpiresAt(14);

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
      organization_id, email, role, token_hash, invited_by, expires_at
    )
    VALUES (
      ${opts.organizationId},
      ${email},
      ${opts.role}::organization_role,
      ${hashInviteToken(token)},
      ${opts.invitedBy},
      ${expiresAt}
    )
    RETURNING id
  `;

  return { token, inviteId: rows[0].id as string, expiresAt };
}

export async function acceptOrganizationInvite(opts: {
  token: string;
  userId: string;
  userEmail: string;
}): Promise<{ organizationId: string; workspaceId: string | null }> {
  const sql = getSql();
  const tokenHash = hashInviteToken(parseInviteInput(opts.token));
  const invites = await sql`
    SELECT id, organization_id, email, role, expires_at, accepted_at, revoked_at
    FROM organization_invites
    WHERE token_hash = ${tokenHash}
    LIMIT 1
  `;
  const invite = invites[0];
  if (!invite) throw new Error("Invite not found");
  if (invite.accepted_at) throw new Error("Invite already accepted");
  if (invite.revoked_at) throw new Error("Invite was revoked");
  if (new Date(invite.expires_at) < new Date()) throw new Error("Invite expired");

  const inviteEmail = String(invite.email).trim().toLowerCase();
  const userEmail = opts.userEmail.trim().toLowerCase();
  if (inviteEmail !== userEmail) {
    throw new Error("Sign in with the invited email address to accept");
  }

  const organizationId = invite.organization_id as string;
  const role = invite.role as OrganizationRole;

  await sql`
    INSERT INTO organization_members (organization_id, user_id, role, invited_by)
    VALUES (
      ${organizationId},
      ${opts.userId},
      ${role}::organization_role,
      ${null}
    )
    ON CONFLICT (organization_id, user_id) DO NOTHING
  `;

  // Add to default (oldest) workspace as reviewer/viewer based on org role
  const wsRole = role === "admin" ? "admin" : "reviewer";
  const workspaces = await sql`
    SELECT id FROM workspaces
    WHERE organization_id = ${organizationId}
    ORDER BY created_at ASC
    LIMIT 1
  `;
  const workspaceId = (workspaces[0]?.id as string) ?? null;
  if (workspaceId) {
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role, invited_by)
      VALUES (${workspaceId}, ${opts.userId}, ${wsRole}::workspace_role, NULL)
      ON CONFLICT (workspace_id, user_id) DO NOTHING
    `;
  }

  await sql`
    UPDATE organization_invites SET accepted_at = now() WHERE id = ${invite.id}
  `;

  await sql`
    UPDATE profiles
    SET current_organization_id = ${organizationId},
        current_workspace_id = COALESCE(${workspaceId}, current_workspace_id)
    WHERE id = ${opts.userId}
  `;

  return { organizationId, workspaceId };
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
