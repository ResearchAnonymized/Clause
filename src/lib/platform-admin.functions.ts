import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePlatformAdmin } from "@/integrations/supabase/auth-middleware";
import { getSql } from "@/db/pool";
import { recordAuthEvent } from "@/lib/auth/events";
import { destroyAllSessions } from "@/lib/auth/session";
import { provisionOrganizationForOwnerInvite, reissueOwnerInvite } from "@/lib/organizations.server";

export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT
        u.id, u.email, u.full_name, u.created_at, u.deactivated_at,
        p.display_name,
        ur.role
      FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      ORDER BY u.created_at ASC
    `;
    return rows.map((r: any) => ({
      id: r.id as string,
      email: r.email as string,
      display_name: (r.display_name ?? r.full_name ?? r.email) as string,
      role: (r.role as string) ?? "reviewer",
      created_at: r.created_at,
      deactivated: Boolean(r.deactivated_at),
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
