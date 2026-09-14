import { getSql } from "@/db/pool";

export type AuthEventName =
  | "login_ok"
  | "login_fail"
  | "signup"
  | "signup_denied"
  | "invite_sent"
  | "invite_accept"
  | "password_reset_request"
  | "password_reset"
  | "role_change"
  | "session_revoke"
  | "access_requested"
  | "access_approved"
  | "access_rejected";

export async function recordAuthEvent(opts: {
  event: AuthEventName;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO auth_events (user_id, email, event, ip, meta)
      VALUES (
        ${opts.userId ?? null},
        ${opts.email ?? null},
        ${opts.event},
        ${opts.ip ?? null},
        ${JSON.stringify(opts.meta ?? {})}::jsonb
      )
    `;
  } catch (err) {
    console.warn("auth_events insert failed", err);
  }
}
