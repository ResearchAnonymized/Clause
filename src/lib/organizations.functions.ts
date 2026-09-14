/**
 * Organization management server functions (invite, members, create, switch).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getSql } from "@/db/pool";
import {
  acceptOrganizationInvite,
  assertOrgMembership,
  countOrgOwners,
  createOrganizationInvite,
  recordOrgAudit,
} from "@/lib/organizations.server";
import {
  inviteRoleMapping,
  parseInviteInput,
  type OrganizationRole,
  type PeopleInviteRole,
} from "@/lib/organizations";

const OrgId = z.object({ organizationId: z.string().uuid() });

export const listMyOrganizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const sql = getSql();
    const rows = await sql`
      SELECT o.id, o.name, o.slug, o.kind, o.created_at, om.role
      FROM organization_members om
      JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = ${userId}
      ORDER BY o.name ASC
    `;
    const profile = await sql`
      SELECT current_organization_id FROM profiles WHERE id = ${userId} LIMIT 1
    `;
    const currentId =
      (profile[0]?.current_organization_id as string | null) ??
      (rows[0]?.id as string | null) ??
      null;
    return {
      organizations: rows.map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        slug: r.slug as string,
        kind: r.kind as string,
        role: r.role as OrganizationRole,
        created_at: r.created_at,
      })),
      currentOrganizationId: currentId,
    };
  });

export const listOrganizationMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrgId.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId);
    const sql = getSql();
    const rows = await sql`
      SELECT
        om.user_id, om.role, om.created_at,
        u.email, u.full_name,
        p.display_name
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      LEFT JOIN profiles p ON p.id = om.user_id
      WHERE om.organization_id = ${data.organizationId}
      ORDER BY
        CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        u.email
    `;
    const memberIds = rows.map((r: any) => r.user_id as string);
    const wsRows = memberIds.length
      ? await sql`
          SELECT wm.user_id, wm.role, w.id, w.name
          FROM workspace_members wm
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE w.organization_id = ${data.organizationId}
            AND wm.user_id = ANY(${memberIds}::uuid[])
          ORDER BY w.created_at ASC
        `
      : [];
    const byUser = new Map<string, { id: string; name: string; role: string }[]>();
    for (const w of wsRows) {
      const uid = w.user_id as string;
      const list = byUser.get(uid) ?? [];
      list.push({ id: w.id as string, name: w.name as string, role: w.role as string });
      byUser.set(uid, list);
    }
    return rows.map((r: any) => ({
      user_id: r.user_id as string,
      role: r.role as OrganizationRole,
      email: r.email as string,
      display_name: (r.display_name ?? r.full_name ?? r.email) as string,
      created_at: r.created_at,
      workspaces: byUser.get(r.user_id as string) ?? [],
    }));
  });

export const listOrganizationInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrgId.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId, ["owner", "admin"]);
    const sql = getSql();
    const rows = await sql`
      SELECT id, email, role, expires_at, created_at, accepted_at, revoked_at
      FROM organization_invites
      WHERE organization_id = ${data.organizationId}
        AND accepted_at IS NULL
        AND revoked_at IS NULL
      ORDER BY created_at DESC
    `;
    return rows.map((r: any) => ({
      id: r.id as string,
      email: r.email as string,
      role: r.role as OrganizationRole,
      expires_at: r.expires_at,
      created_at: r.created_at,
    }));
  });

const CreateOrg = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(["personal", "company"]).default("company"),
});

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateOrg.parse(data))
  .handler(async () => {
    throw new Error("Only GPT-Lab platform admins can create organizations");
  });

const InviteInput = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "member", "reviewer", "viewer"]).default("reviewer"),
  workspaceIds: z.array(z.string().uuid()).min(1),
});

function peopleInviteRole(role: string): PeopleInviteRole {
  if (role === "admin") return "admin";
  if (role === "viewer") return "viewer";
  return "reviewer";
}

export const inviteToOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InviteInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, session } = context as {
      userId: string;
      session: { user: { email?: string } };
    };
    const mapped = inviteRoleMapping(peopleInviteRole(data.role));
    const { token, inviteId, expiresAt } = await createOrganizationInvite({
      organizationId: data.organizationId,
      email: data.email,
      role: mapped.orgRole,
      invitedBy: userId,
      workspaceIds: data.workspaceIds,
      workspaceRole: mapped.workspaceRole,
    });
    const { colleagueInviteMail, inviteAcceptUrl, sendMail } = await import("@/lib/mailer.server");
    const { PRODUCT_NAME } = await import("@/config/instance");
    const sql = getSql();
    const acceptUrl = inviteAcceptUrl(token);
    const orgNameRow = await sql`
      SELECT name FROM organizations WHERE id = ${data.organizationId} LIMIT 1
    `;
    const mail = colleagueInviteMail({
      product: PRODUCT_NAME,
      orgName: (orgNameRow[0]?.name as string) ?? undefined,
      email: data.email.trim().toLowerCase(),
      acceptUrl,
    });
    const sent = await sendMail({
      to: data.email.trim().toLowerCase(),
      subject: mail.subject,
      text: mail.text,
    });
    const { recordAuthEvent } = await import("@/lib/auth/events");
    await recordAuthEvent({
      event: "invite_sent",
      userId,
      email: data.email,
      meta: { organizationId: data.organizationId, role: mapped.orgRole, emailed: sent.delivered },
    });
    await recordOrgAudit({
      organizationId: data.organizationId,
      actorUserId: userId,
      actorEmail: session.user.email ?? null,
      event: "invite_sent",
      targetEmail: data.email.trim().toLowerCase(),
      meta: { orgRole: mapped.orgRole, workspaceRole: mapped.workspaceRole, workspaceIds: data.workspaceIds },
    });
    return { inviteId, expiresAt: expiresAt.toISOString(), acceptUrl, token, emailed: sent.delivered };
  });

const AcceptInvite = z.object({ token: z.string().min(1) });

export const acceptInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AcceptInvite.parse(data))
  .handler(async ({ data, context }) => {
    const { userId, session } = context as {
      userId: string;
      session: { user: { email: string } };
    };
    return acceptOrganizationInvite({
      token: parseInviteInput(data.token),
      userId,
      userEmail: session.user.email,
    });
  });

/** Public preview of invite (no auth) for the accept page copy. */
export const peekInvite = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AcceptInvite.parse(data))
  .handler(async ({ data }) => {
    const sql = getSql();
    const { hashInviteToken } = await import("@/lib/organizations.server");
    const token = parseInviteInput(data.token);
    const rows = await sql`
      SELECT i.email, i.role, i.expires_at, i.accepted_at, i.revoked_at, o.name AS org_name
      FROM organization_invites i
      JOIN organizations o ON o.id = i.organization_id
      WHERE i.token_hash = ${hashInviteToken(token)}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "Invite not found" };
    if (row.accepted_at) return { ok: false as const, error: "Already accepted" };
    if (row.revoked_at) return { ok: false as const, error: "Revoked" };
    if (new Date(row.expires_at) < new Date()) return { ok: false as const, error: "Expired" };
    return {
      ok: true as const,
      email: row.email as string,
      role: row.role as string,
      orgName: row.org_name as string,
      expiresAt: row.expires_at,
    };
  });

const RevokeInvite = z.object({
  organizationId: z.string().uuid(),
  inviteId: z.string().uuid(),
});

export const revokeOrganizationInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RevokeInvite.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId, ["owner", "admin"]);
    const sql = getSql();
    const pending = await sql`
      SELECT email FROM organization_invites
      WHERE id = ${data.inviteId} AND organization_id = ${data.organizationId}
      LIMIT 1
    `;
    await sql`
      UPDATE organization_invites
      SET revoked_at = now()
      WHERE id = ${data.inviteId}
        AND organization_id = ${data.organizationId}
        AND accepted_at IS NULL
    `;
    await recordOrgAudit({
      organizationId: data.organizationId,
      actorUserId: userId,
      event: "invite_revoked",
      targetEmail: (pending[0]?.email as string) ?? null,
    });
    return { ok: true };
  });

const ChangeRole = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "member"]),
});

export const changeOrganizationMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ChangeRole.parse(data))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context as { userId: string };
    const { role: actorRole } = await assertOrgMembership(actorId, data.organizationId, [
      "owner",
      "admin",
    ]);
    if (data.role === "owner" && actorRole !== "owner") {
      throw new Error("Only an owner can transfer ownership");
    }
    if (data.userId === actorId && data.role !== "owner" && actorRole === "owner") {
      const owners = await countOrgOwners(data.organizationId);
      if (owners <= 1) throw new Error("Cannot demote the last owner");
    }
    const sql = getSql();
    await sql`
      UPDATE organization_members
      SET role = ${data.role}::organization_role, updated_at = now()
      WHERE organization_id = ${data.organizationId} AND user_id = ${data.userId}
    `;
    const target = await sql`SELECT email FROM users WHERE id = ${data.userId} LIMIT 1`;
    await recordOrgAudit({
      organizationId: data.organizationId,
      actorUserId: actorId,
      event: "role_changed",
      targetEmail: (target[0]?.email as string) ?? null,
      meta: { role: data.role },
    });
    return { ok: true };
  });

const RemoveMember = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const removeOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RemoveMember.parse(data))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context as { userId: string };
    await assertOrgMembership(actorId, data.organizationId, ["owner", "admin"]);
    const sql = getSql();
    const target = await sql`
      SELECT role FROM organization_members
      WHERE organization_id = ${data.organizationId} AND user_id = ${data.userId}
      LIMIT 1
    `;
    if (!target.length) throw new Error("Member not found");
    if (target[0].role === "owner") {
      const owners = await countOrgOwners(data.organizationId);
      if (owners <= 1) throw new Error("Cannot remove the last owner");
    }
    await sql`
      DELETE FROM organization_members
      WHERE organization_id = ${data.organizationId} AND user_id = ${data.userId}
    `;
    // Remove from org workspaces
    await sql`
      DELETE FROM workspace_members wm
      USING workspaces w
      WHERE wm.workspace_id = w.id
        AND w.organization_id = ${data.organizationId}
        AND wm.user_id = ${data.userId}
    `;
    const removed = await sql`SELECT email FROM users WHERE id = ${data.userId} LIMIT 1`;
    await recordOrgAudit({
      organizationId: data.organizationId,
      actorUserId: actorId,
      event: "member_removed",
      targetEmail: (removed[0]?.email as string) ?? null,
    });
    return { ok: true };
  });

const SwitchOrg = z.object({ organizationId: z.string().uuid() });

export const switchOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SwitchOrg.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId);
    const sql = getSql();
    // Prefer existing current workspace if still in this org; else first workspace in org
    const profile = await sql`
      SELECT current_workspace_id FROM profiles WHERE id = ${userId} LIMIT 1
    `;
    const currentWs = profile[0]?.current_workspace_id as string | null;
    let workspaceId: string | null = null;
    if (currentWs) {
      const ok = await sql`
        SELECT w.id FROM workspaces w
        JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${userId}
        WHERE w.id = ${currentWs} AND w.organization_id = ${data.organizationId}
        LIMIT 1
      `;
      if (ok.length) workspaceId = ok[0].id as string;
    }
    if (!workspaceId) {
      const ws = await sql`
        SELECT w.id FROM workspaces w
        JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${userId}
        WHERE w.organization_id = ${data.organizationId}
        ORDER BY w.created_at ASC
        LIMIT 1
      `;
      workspaceId = (ws[0]?.id as string) ?? null;
    }
    await sql`
      UPDATE profiles
      SET current_organization_id = ${data.organizationId},
          current_workspace_id = ${workspaceId}
      WHERE id = ${userId}
    `;
    return { organizationId: data.organizationId, workspaceId };
  });

const RenameOrg = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(120),
});

export const renameOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RenameOrg.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId, ["owner", "admin"]);
    const sql = getSql();
    await sql`
      UPDATE organizations
      SET name = ${data.name.trim()}, updated_at = now()
      WHERE id = ${data.organizationId}
    `;
    return { ok: true };
  });

const CreateWs = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(120),
});

export const createWorkspaceInOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateWs.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId, ["owner", "admin"]);
    const sql = getSql();
    const { uniqueSlug } = await import("@/lib/organizations");
    const slug = uniqueSlug(data.name, data.organizationId);
    const rows = await sql`
      INSERT INTO workspaces (name, slug, owner_id, organization_id)
      VALUES (${data.name.trim()}, ${slug}, ${userId}, ${data.organizationId})
      RETURNING id
    `;
    const workspaceId = rows[0].id as string;
    const managers = await sql`
      SELECT user_id, role FROM organization_members
      WHERE organization_id = ${data.organizationId}
        AND role IN ('owner'::organization_role, 'admin'::organization_role)
    `;
    for (const m of managers) {
      const wsRole = m.role === "owner" ? "owner" : "admin";
      await sql`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (${workspaceId}, ${m.user_id}, ${wsRole}::workspace_role)
        ON CONFLICT DO NOTHING
      `;
    }
    await recordOrgAudit({
      organizationId: data.organizationId,
      actorUserId: userId,
      event: "workspace_created",
      meta: { workspaceId, name: data.name.trim() },
    });
    return { workspaceId };
  });

export const listOrganizationWorkspaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrgId.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId);
    const sql = getSql();
    const rows = await sql`
      SELECT id, name, created_at
      FROM workspaces
      WHERE organization_id = ${data.organizationId}
      ORDER BY created_at ASC
    `;
    return rows.map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      created_at: r.created_at,
    }));
  });

export const listOrganizationAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrgId.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertOrgMembership(userId, data.organizationId, ["owner", "admin"]);
    const sql = getSql();
    const rows = await sql`
      SELECT actor_email, event, target_email, meta, created_at
      FROM organization_audit_events
      WHERE organization_id = ${data.organizationId}
      ORDER BY created_at DESC
      LIMIT 50
    `;
    return rows.map((r: any) => ({
      actor_email: (r.actor_email as string) ?? null,
      event: r.event as string,
      target_email: (r.target_email as string) ?? null,
      meta: r.meta ?? {},
      created_at: r.created_at,
    }));
  });

const GrantWs = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceRole: z.enum(["admin", "reviewer", "viewer"]).default("reviewer"),
});

export const grantWorkspaceAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GrantWs.parse(data))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context as { userId: string };
    await assertOrgMembership(actorId, data.organizationId, ["owner", "admin"]);
    await assertOrgMembership(data.userId, data.organizationId);
    const sql = getSql();
    const ws = await sql`
      SELECT id FROM workspaces
      WHERE id = ${data.workspaceId} AND organization_id = ${data.organizationId}
      LIMIT 1
    `;
    if (!ws.length) throw new Error("Workspace is not in this organization");
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${data.workspaceId}, ${data.userId}, ${data.workspaceRole}::workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `;
    const target = await sql`SELECT email FROM users WHERE id = ${data.userId} LIMIT 1`;
    await recordOrgAudit({
      organizationId: data.organizationId,
      actorUserId: actorId,
      event: "workspace_access_changed",
      targetEmail: (target[0]?.email as string) ?? null,
      meta: { workspaceId: data.workspaceId, workspaceRole: data.workspaceRole },
    });
    return { ok: true };
  });
