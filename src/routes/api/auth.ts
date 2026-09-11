import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateUser,
  consumeAuthToken,
  countUsers,
  createSession,
  destroyAllSessions,
  destroySession,
  getSessionFromRequest,
  issueAuthToken,
  provisionNewUser,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
  setPasswordForUser,
} from "@/lib/auth/session";
import { signupMode } from "@/config/instance";
import { clientKey, rateLimit } from "@/lib/auth/rate-limit";
import { recordAuthEvent } from "@/lib/auth/events";
import { sendMail } from "@/lib/mailer.server";
import { PRODUCT_NAME } from "@/config/instance";
import { getSql } from "@/db/pool";
import { hashInviteToken } from "@/lib/organizations.server";
import { looksLikeInviteToken, parseInviteInput } from "@/lib/organizations";

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

async function accessState() {
  const users = await countUsers();
  const mode = signupMode();
  const bootstrap = users === 0;
  return {
    signupMode: mode,
    bootstrap,
    canSignUp: bootstrap || mode === "open",
    inviteRequired: !bootstrap && mode === "invite-only",
    signupOff: !bootstrap && mode === "off",
  };
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      GET: async () => {
        const session = await getSessionFromRequest();
        const access = await accessState();
        return json({ session, access });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          action:
            | "signIn"
            | "signUp"
            | "signOut"
            | "requestReset"
            | "confirmReset"
            | "revokeAll";
          email?: string;
          password?: string;
          fullName?: string;
          organizationName?: string;
          organizationKind?: "personal" | "company";
          inviteToken?: string;
          resetToken?: string;
        };
        const ip = clientKey(request);

        if (body.action === "signOut") {
          await destroySession();
          return json({ ok: true }, { headers: { "set-cookie": sessionClearCookieHeader() } });
        }

        if (body.action === "revokeAll") {
          const session = await getSessionFromRequest();
          if (!session) return json({ error: { message: "Not signed in" } }, { status: 401 });
          await destroyAllSessions(session.user.id);
          await recordAuthEvent({ event: "session_revoke", userId: session.user.id, email: session.user.email, ip });
          return json({ ok: true }, { headers: { "set-cookie": sessionClearCookieHeader() } });
        }

        if (body.action === "requestReset") {
          if (!rateLimit(`reset:${ip}`, 5, 15 * 60 * 1000)) {
            return json({ error: { message: "Too many reset requests" } }, { status: 429 });
          }
          const email = String(body.email ?? "").trim().toLowerCase();
          if (!email) return json({ error: { message: "Email required" } }, { status: 400 });
          const sql = getSql();
          const rows = await sql`SELECT id, email FROM users WHERE email = ${email} AND deactivated_at IS NULL LIMIT 1`;
          if (rows[0]) {
            const token = await issueAuthToken({ purpose: "reset", userId: rows[0].id, email, hours: 2 });
            const origin = process.env.APP_URL || "http://localhost:3000";
            const url = `${origin}/reset?token=${token}`;
            await sendMail({
              to: email,
              subject: `Reset your ${PRODUCT_NAME} password`,
              text: `Reset your password:\n${url}\n\nThis link expires in 2 hours.`,
            });
            await recordAuthEvent({ event: "password_reset_request", userId: rows[0].id, email, ip });
          }
          return json({ ok: true });
        }

        if (body.action === "confirmReset") {
          if (!body.resetToken || !body.password) {
            return json({ error: { message: "Token and password required" } }, { status: 400 });
          }
          try {
            const used = await consumeAuthToken(body.resetToken, "reset");
            if (!used.userId) return json({ error: { message: "Invalid reset link" } }, { status: 400 });
            await setPasswordForUser(used.userId, body.password);
            await recordAuthEvent({ event: "password_reset", userId: used.userId, email: used.email, ip });
            return json({ ok: true });
          } catch (err: any) {
            return json({ error: { message: String(err?.message ?? err) } }, { status: 400 });
          }
        }

        if (!body.email || !body.password) {
          return json({ error: { message: "Email and password required" } }, { status: 400 });
        }

        try {
          if (body.action === "signIn") {
            if (!rateLimit(`login:${ip}`, 12, 15 * 60 * 1000)) {
              return json({ error: { message: "Too many sign-in attempts" } }, { status: 429 });
            }
            try {
              const user = await authenticateUser(body.email, body.password);
              if (!user) {
                await recordAuthEvent({ event: "login_fail", email: body.email, ip });
                return json({ error: { message: "Invalid email or password" } }, { status: 401 });
              }
              const { token, expiresAt } = await createSession(user.id);
              await recordAuthEvent({ event: "login_ok", userId: user.id, email: user.email, ip });
              const session = {
                access_token: token,
                user,
                expires_at: Math.floor(expiresAt.getTime() / 1000),
              };
              return json(
                { data: { session, user }, error: null },
                { headers: { "set-cookie": sessionSetCookieHeader(token, expiresAt) } },
              );
            } catch (err: any) {
              await recordAuthEvent({ event: "login_fail", email: body.email, ip, meta: { message: String(err?.message ?? err) } });
              return json({ error: { message: String(err?.message ?? "Invalid email or password") } }, { status: 401 });
            }
          }

          if (body.action === "signUp") {
            if (!rateLimit(`signup:${ip}`, 8, 60 * 60 * 1000)) {
              return json({ error: { message: "Too many sign-up attempts" } }, { status: 429 });
            }
            const access = await accessState();
            const inviteToken = parseInviteInput(String(body.inviteToken ?? ""));
            if (access.signupOff && !inviteToken) {
              await recordAuthEvent({ event: "signup_denied", email: body.email, ip, meta: { reason: "off" } });
              return json({ error: { message: "New accounts are disabled on this instance" } }, { status: 403 });
            }
            if (access.inviteRequired && !inviteToken) {
              await recordAuthEvent({ event: "signup_denied", email: body.email, ip, meta: { reason: "invite" } });
              return json(
                { error: { message: "This instance is invite-only. Ask an organization admin to invite your work email, then paste that invite link here." } },
                { status: 403 },
              );
            }
            if (inviteToken) {
              if (!looksLikeInviteToken(inviteToken)) {
                return json(
                  {
                    error: {
                      message:
                        "That is not an invite link. Paste the full link from your admin (Settings → Organization). A name or password will not work.",
                    },
                  },
                  { status: 400 },
                );
              }
              const sql = getSql();
              const rows = await sql`
                SELECT email, expires_at, accepted_at, revoked_at
                FROM organization_invites
                WHERE token_hash = ${hashInviteToken(inviteToken)}
                LIMIT 1
              `;
              const inv = rows[0];
              if (!inv) {
                return json(
                  { error: { message: "No invite matches this link. Ask an organization admin to create a new invite for this email." } },
                  { status: 400 },
                );
              }
              if (inv.accepted_at) {
                return json({ error: { message: "This invite was already used. Sign in, or ask an admin for a new invite." } }, { status: 400 });
              }
              if (inv.revoked_at) {
                return json({ error: { message: "This invite was revoked. Ask an organization admin for a new link." } }, { status: 400 });
              }
              if (new Date(inv.expires_at) < new Date()) {
                return json(
                  { error: { message: "This invite expired (links last 14 days). Ask an organization admin for a new one." } },
                  { status: 400 },
                );
              }
              if (String(inv.email).toLowerCase() !== body.email.trim().toLowerCase()) {
                return json({ error: { message: "Use the email address this invite was sent to" } }, { status: 400 });
              }
            }

            const user = await provisionNewUser({
              email: body.email,
              password: body.password,
              fullName: body.fullName,
              organizationName: inviteToken ? undefined : body.organizationName,
              organizationKind: inviteToken ? undefined : body.organizationKind,
              inviteToken: inviteToken || undefined,
            });
            const { token, expiresAt } = await createSession(user.id);
            await recordAuthEvent({
              event: "signup",
              userId: user.id,
              email: user.email,
              ip,
              meta: { invite: Boolean(inviteToken), bootstrap: access.bootstrap },
            });
            const session = {
              access_token: token,
              user,
              expires_at: Math.floor(expiresAt.getTime() / 1000),
            };
            return json(
              { data: { session, user }, error: null },
              { headers: { "set-cookie": sessionSetCookieHeader(token, expiresAt) } },
            );
          }
        } catch (err: any) {
          const msg = String(err?.message ?? err);
          if (msg.includes("unique") || msg.includes("duplicate")) {
            return json({ error: { message: "An account with this email already exists" } }, { status: 409 });
          }
          return json({ error: { message: msg } }, { status: 500 });
        }

        return json({ error: { message: "Unknown action" } }, { status: 400 });
      },
    },
  },
});
