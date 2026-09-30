import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePlatformAdmin, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateLimit } from "@/lib/auth/rate-limit";
import { callerIp } from "@/lib/rate-limit.server";
import {
  approveAccessRequest,
  listPendingAccessRequests,
  listPendingJoinRequestsForOrganization,
  rejectAccessRequest,
  submitAccessRequest,
} from "@/lib/access-requests.server";

const Submit = z.object({
  organizationName: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  contactName: z.string().min(1).max(120),
  note: z.string().max(500).optional(),
});

export const submitPublicAccessRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Submit.parse(data))
  .handler(async ({ data }) => {
    const ip = callerIp();
    if (!rateLimit(`access-request:${ip}`, 5, 60 * 60 * 1000)) {
      const err = new Error("Too many requests. Try again later.");
      (err as { status?: number }).status = 429;
      throw err;
    }
    await submitAccessRequest({
      organizationName: data.organizationName,
      contactEmail: data.contactEmail,
      contactName: data.contactName,
      note: data.note,
      ip,
    });
    return { ok: true as const };
  });

export const listAccessRequests = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .handler(async () => listPendingAccessRequests());

const Approve = z.object({
  requestId: z.string().uuid(),
  workspaceName: z.string().min(1).max(120).optional(),
  role: z.enum(["owner", "admin", "reviewer", "viewer"]).optional(),
  grantPlatformAdmin: z.boolean().optional(),
});

export const approveAccessRequestFn = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => Approve.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return approveAccessRequest({
      requestId: data.requestId,
      actorUserId: userId,
      workspaceName: data.workspaceName,
      role: data.role,
      grantPlatformAdmin: data.grantPlatformAdmin,
    });
  });

const OrgRequest = z.object({
  organizationId: z.string().uuid(),
});

export const listOrganizationJoinRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrgRequest.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { assertOrgMembership } = await import("@/lib/organizations.server");
    await assertOrgMembership(userId, data.organizationId, ["owner", "admin"]);
    return listPendingJoinRequestsForOrganization(data.organizationId);
  });

const OrgApprove = z.object({
  organizationId: z.string().uuid(),
  requestId: z.string().uuid(),
  role: z.enum(["admin", "reviewer", "viewer"]).optional(),
});

export const approveOrganizationJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrgApprove.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return approveAccessRequest({
      requestId: data.requestId,
      actorUserId: userId,
      asOrganizationId: data.organizationId,
      role: data.role,
    });
  });

const OrgReject = z.object({
  organizationId: z.string().uuid(),
  requestId: z.string().uuid(),
  reason: z.string().max(300).optional(),
});

export const rejectOrganizationJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OrgReject.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return rejectAccessRequest({
      requestId: data.requestId,
      actorUserId: userId,
      reason: data.reason,
      asOrganizationId: data.organizationId,
    });
  });

const Reject = z.object({
  requestId: z.string().uuid(),
  reason: z.string().max(300).optional(),
});

export const rejectAccessRequestFn = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .inputValidator((data: unknown) => Reject.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return rejectAccessRequest({
      requestId: data.requestId,
      actorUserId: userId,
      reason: data.reason,
    });
  });
