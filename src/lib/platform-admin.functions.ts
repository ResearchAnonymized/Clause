import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePlatformAdmin } from "@/integrations/supabase/auth-middleware";
import { getSql } from "@/db/pool";
import { recordAuthEvent } from "@/lib/auth/events";
import { destroyAllSessions, issueAuthToken } from "@/lib/auth/session";
import { mailConfigured, passwordResetUrl } from "@/lib/mailer.server";
import { listPendingAccessRequests } from "@/lib/access-requests.server";
import { provisionOrganizationForOwnerInvite, reissueOwnerInvite } from "@/lib/organizations.server";
import { rolesFromSaas, saasRoleFromMembership, type SaasOrgRole } from "@/lib/saas-roles";

export type { SaasOrgRole };

export const listPlatformWaiting = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const requests = await listPendingAccessRequests();
    const sql = getSql();
    const rows = await sql`
      SELECT
        i.id,
        i.email,
        i.role,
        i.workspace_role,
        i.grant_platform_admin,
        i.created_at,
        i.expires_at,
        o.id AS organization_id,
        o.name AS organization_name,
        inviter.email AS invited_by_email,
        ar.contact_name,
        ar.note,
        ar.created_at AS requested_at,
        ar.decided_at AS approved_at
      FROM organization_invites i
      JOIN organizations o ON o.id = i.organization_id
      LEFT JOIN users inviter ON inviter.id = i.invited_by
      LEFT JOIN LATERAL (
        SELECT contact_name, note, created_at, decided_at
        FROM access_requests
        WHERE lower(contact_email) = lower(i.email)
          AND status = 'approved'
        ORDER BY decided_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      ) ar ON true
      WHERE i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > now()
      ORDER BY i.created_at DESC
    `;
    return {
      requests,
      mailConfigured: mailConfigured(),
      pendingAccounts: rows.map((r: any) => ({
        id: r.id as string,
        email: r.email as string,
        role: r.role as string,
        saas_role: saasRoleFromMembership(String(r.role), (r.workspace_role as string | null) ?? null),
        grant_platform_admin: Boolean(r.grant_platform_admin),
        created_at: r.created_at,
        expires_at: r.expires_at,
        organization_id: r.organization_id as string,
        organization_name: r.organization_name as string,
        invited_by_email: (r.invited_by_email as string) ?? null,
        contact_name: (r.contact_name as string) ?? "",
        note: (r.note as string) ?? "",
        requested_at: r.requested_at ?? null,
        approved_at: r.approved_at ?? r.created_at,
      })),
    };
  });

export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT
        u.id, u.email, u.full_name, u.created_at, u.deactivated_at,
        p.display_name,
        ur.role,
        (
          SELECT max(s.created_at) FROM sessions s WHERE s.user_id = u.id
        ) AS last_seen
      FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      ORDER BY u.created_at ASC
    `;
    const memberships = await sql`
      SELECT
        om.user_id,
        om.organization_id,
        o.name AS organization_name,
        om.role AS org_role,
        (
          SELECT wm.role FROM workspace_members wm
          JOIN workspaces w ON w.id = wm.workspace_id
          WHERE wm.user_id = om.user_id AND w.organization_id = om.organization_id
          ORDER BY CASE wm.role
            WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'reviewer' THEN 2 ELSE 3 END
          LIMIT 1
        ) AS workspace_role
      FROM organization_members om
      JOIN organizations o ON o.id = om.organization_id
      ORDER BY o.name ASC
    `;
    const byUser = new Map<string, {
      organization_id: string;
      organization_name: string;
      org_role: string;
      workspace_role: string | null;
      saas_role: SaasOrgRole;
      sole_owner: boolean;
    }[]>();
    const ownerCountByOrg = new Map<string, number>();
    for (const m of memberships as any[]) {
      if (m.org_role === "owner") {
        const id = m.organization_id as string;
        ownerCountByOrg.set(id, (ownerCountByOrg.get(id) ?? 0) + 1);
      }
    }
    for (const m of memberships as any[]) {
      const userId = m.user_id as string;
      const orgId = m.organization_id as string;
      const list = byUser.get(userId) ?? [];
      list.push({
        organization_id: orgId,
        organization_name: m.organization_name as string,
        org_role: m.org_role as string,
        workspace_role: (m.workspace_role as string | null) ?? null,
        saas_role: saasRoleFromMembership(String(m.org_role), (m.workspace_role as string | null) ?? null),
        sole_owner: m.org_role === "owner" && (ownerCountByOrg.get(orgId) ?? 0) <= 1,
      });
      byUser.set(userId, list);
    }
    return rows.map((r: any) => ({
      id: r.id as string,
      email: r.email as string,
      display_name: (r.display_name ?? r.full_name ?? r.email) as string,
      role: (r.role as string) ?? "reviewer",
      created_at: r.created_at,
      last_seen: r.last_seen ?? null,
      deactivated: Boolean(r.deactivated_at),
      memberships: byUser.get(r.id as string) ?? [],
    }));
  });

const SetRole = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "reviewer", "viewer"]),
});

export const setPlatformRole = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => SetRole.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const sql = getSql();
    if (data.userId === userId && data.role !== "admin") {
      throw new Error("You cannot remove your own platform admin access.");
    }
    if (data.role !== "admin") {
      const current = await sql`
        SELECT role FROM user_roles WHERE user_id = ${data.userId} AND role = 'admin'::app_role LIMIT 1
      `;
      if (current.length) {
        const admins = await sql`SELECT count(*)::int AS c FROM user_roles WHERE role = 'admin'::app_role`;
        if (Number(admins[0]?.c ?? 0) <= 1) {
          throw new Error("Keep at least one platform admin.");
        }
      }
    }
    await sql`DELETE FROM user_roles WHERE user_id = ${data.userId}`;
    await sql`
      INSERT INTO user_roles (user_id, role)
      VALUES (${data.userId}, ${data.role}::app_role)
    `;
    await recordAuthEvent({
      event: "role_change",
      userId,
      meta: { target: data.userId, role: data.role },
    });
    return { ok: true };
  });

const SetMembership = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  role: z.enum(["owner", "admin", "reviewer", "viewer"]),
});

export const setPlatformMembershipRole = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => SetMembership.parse(data))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context as { userId: string };
    const sql = getSql();
    const member = await sql`
      SELECT role FROM organization_members
      WHERE organization_id = ${data.organizationId} AND user_id = ${data.userId}
      LIMIT 1
    `;
    if (!member.length) throw new Error("This person is not in that organization.");
    const { orgRole, workspaceRole } = rolesFromSaas(data.role);
    if (member[0].role === "owner" && orgRole !== "owner") {
      const { countOrgOwners } = await import("@/lib/organizations.server");
      const owners = await countOrgOwners(data.organizationId);
      if (owners <= 1) throw new Error("Keep at least one owner in this organization.");
    }
    await sql`
      UPDATE organization_members
      SET role = ${orgRole}::organization_role, updated_at = now()
      WHERE organization_id = ${data.organizationId} AND user_id = ${data.userId}
    `;
    await sql`
      UPDATE workspace_members wm
      SET role = ${workspaceRole}::workspace_role, updated_at = now()
      FROM workspaces w
      WHERE wm.workspace_id = w.id
        AND w.organization_id = ${data.organizationId}
        AND wm.user_id = ${data.userId}
    `;
    const target = await sql`SELECT email FROM users WHERE id = ${data.userId} LIMIT 1`;
    const { recordOrgAudit } = await import("@/lib/organizations.server");
    await recordOrgAudit({
      organizationId: data.organizationId,
      actorUserId: actorId,
      event: "role_changed",
      targetEmail: (target[0]?.email as string) ?? null,
      meta: { role: data.role, orgRole, workspaceRole, by: "platform_admin" },
    });
    return { ok: true };
  });

const Deactivate = z.object({
  userId: z.string().uuid(),
  deactivated: z.boolean(),
});

export const setUserDeactivated = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => Deactivate.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    if (data.userId === userId) throw new Error("You cannot deactivate yourself");
    const sql = getSql();
    await sql`
      UPDATE users
      SET deactivated_at = ${data.deactivated ? new Date() : null}, updated_at = now()
      WHERE id = ${data.userId}
    `;
    if (data.deactivated) await destroyAllSessions(data.userId);
    return { ok: true };
  });

const TargetUser = z.object({
  userId: z.string().uuid(),
});

export const issuePasswordResetLink = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => TargetUser.parse(data))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context as { userId: string };
    if (data.userId === actorId) {
      throw new Error("Use Forgot password on the sign-in page for your own account.");
    }
    const sql = getSql();
    const rows = await sql`
      SELECT id, email, deactivated_at FROM users WHERE id = ${data.userId} LIMIT 1
    `;
    if (!rows[0]) throw new Error("User not found.");
    if (rows[0].deactivated_at) {
      throw new Error("Reactivate the account before issuing a reset link.");
    }
    const email = String(rows[0].email);
    const token = await issueAuthToken({
      purpose: "reset",
      userId: data.userId,
      email,
      hours: 2,
    });
    await recordAuthEvent({
      event: "password_reset_request",
      userId: data.userId,
      email,
      meta: { by: "platform_admin", actor: actorId },
    });
    return { url: passwordResetUrl(token), expiresInHours: 2 };
  });

export const signOutUserSessions = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => TargetUser.parse(data))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context as { userId: string };
    if (data.userId === actorId) throw new Error("You cannot sign out your own sessions here.");
    const sql = getSql();
    const rows = await sql`SELECT email FROM users WHERE id = ${data.userId} LIMIT 1`;
    if (!rows[0]) throw new Error("User not found.");
    await destroyAllSessions(data.userId);
    await recordAuthEvent({
      event: "session_revoke",
      userId: data.userId,
      email: String(rows[0].email),
      meta: { by: "platform_admin", actor: actorId },
    });
    return { ok: true };
  });

export const listPlatformOrganizations = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT
        o.id, o.name, o.created_at,
        (SELECT count(*)::int FROM organization_members om WHERE om.organization_id = o.id) AS member_count,
        (
          SELECT u.email FROM organization_members om
          JOIN users u ON u.id = om.user_id
          WHERE om.organization_id = o.id AND om.role = 'owner'
          ORDER BY om.created_at ASC
          LIMIT 1
        ) AS owner_email,
        (
          SELECT i.email FROM organization_invites i
          WHERE i.organization_id = o.id
            AND i.role = 'owner'
            AND i.accepted_at IS NULL
            AND i.revoked_at IS NULL
          ORDER BY i.created_at DESC
          LIMIT 1
        ) AS pending_owner_email
      FROM organizations o
      ORDER BY o.created_at DESC
    `;
    return rows.map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      created_at: r.created_at,
      member_count: Number(r.member_count ?? 0),
      owner_email: (r.owner_email as string) ?? null,
      pending_owner_email: (r.pending_owner_email as string) ?? null,
    }));
  });

const ProvisionOrg = z.object({
  name: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  workspaceName: z.string().min(1).max(120).optional(),
});

export const provisionOrganization = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => ProvisionOrg.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const result = await provisionOrganizationForOwnerInvite({
      name: data.name,
      ownerEmail: data.ownerEmail,
      createdBy: userId,
      workspaceName: data.workspaceName,
    });
    const { inviteAcceptUrl, ownerInviteMail, sendMail } = await import("@/lib/mailer.server");
    const { PRODUCT_NAME } = await import("@/config/instance");
    const acceptUrl = inviteAcceptUrl(result.token);
    const mail = ownerInviteMail({
      product: PRODUCT_NAME,
      orgName: data.name.trim(),
      email: data.ownerEmail.trim().toLowerCase(),
      acceptUrl,
    });
    const sent = await sendMail({
      to: data.ownerEmail.trim().toLowerCase(),
      subject: mail.subject,
      text: mail.text,
    });
    return {
      organizationId: result.organizationId,
      workspaceId: result.workspaceId,
      inviteId: result.inviteId,
      expiresAt: result.expiresAt.toISOString(),
      acceptUrl,
      emailed: sent.delivered,
    };
  });

const ReissueOwner = z.object({
  organizationId: z.string().uuid(),
});

export const reissueOwnerInviteLink = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => ReissueOwner.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return reissueOwnerInvite({
      organizationId: data.organizationId,
      actorUserId: userId,
    });
  });

const PendingInvite = z.object({
  inviteId: z.string().uuid(),
  role: z.enum(["owner", "admin", "reviewer", "viewer"]),
  grantPlatformAdmin: z.boolean(),
});

export const setPendingInviteRole = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => PendingInvite.parse(data))
  .handler(async ({ data, context }) => {
    const { userId: actorId } = context as { userId: string };
    const sql = getSql();
    const rows = await sql`
      SELECT id, organization_id, email, accepted_at, revoked_at
      FROM organization_invites
      WHERE id = ${data.inviteId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || row.accepted_at || row.revoked_at) {
      throw new Error("This invite is no longer open.");
    }
    const { orgRole, workspaceRole } = rolesFromSaas(data.role);
    await sql`
      UPDATE organization_invites
      SET role = ${orgRole}::organization_role,
          workspace_role = ${workspaceRole}::workspace_role,
          grant_platform_admin = ${data.grantPlatformAdmin}
      WHERE id = ${data.inviteId}
    `;
    await sql`
      UPDATE organization_invite_workspaces
      SET workspace_role = ${workspaceRole}::workspace_role
      WHERE invite_id = ${data.inviteId}
    `;
    const { recordOrgAudit } = await import("@/lib/organizations.server");
    await recordOrgAudit({
      organizationId: row.organization_id as string,
      actorUserId: actorId,
      event: "invite_role_changed",
      targetEmail: String(row.email),
      meta: { role: data.role, grantPlatformAdmin: data.grantPlatformAdmin },
    });
    return { ok: true };
  });

const ResendInvite = z.object({
  inviteId: z.string().uuid(),
});

export const resendPendingAccountEmail = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => ResendInvite.parse(data))
  .handler(async ({ data }) => {
    const sql = getSql();
    const rows = await sql`
      SELECT i.email, i.role, i.workspace_role, o.name AS organization_name
      FROM organization_invites i
      JOIN organizations o ON o.id = i.organization_id
      WHERE i.id = ${data.inviteId}
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > now()
      LIMIT 1
    `;
    if (!rows[0]) throw new Error("This person is no longer waiting to join.");
    const { accessApprovedMail, createAccountUrl, sendMail } = await import("@/lib/mailer.server");
    const { PRODUCT_NAME } = await import("@/config/instance");
    const { saasRoleFromMembership, saasRoleLabelEn } = await import("@/lib/saas-roles");
    const email = String(rows[0].email);
    const saas = saasRoleFromMembership(String(rows[0].role), (rows[0].workspace_role as string | null) ?? null);
    const mail = accessApprovedMail({
      product: PRODUCT_NAME,
      orgName: String(rows[0].organization_name),
      email,
      roleLabel: saasRoleLabelEn(saas),
      acceptUrl: createAccountUrl(),
    });
    const sent = await sendMail({ to: email, subject: mail.subject, text: mail.text });
    return { emailed: sent.delivered };
  });
