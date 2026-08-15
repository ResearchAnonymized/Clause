import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateUser,
  createSession,
  destroySession,
  getSessionFromRequest,
  provisionNewUser,
  sessionClearCookieHeader,
  sessionSetCookieHeader,
} from "@/lib/auth/session";

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      GET: async () => {
        const session = await getSessionFromRequest();
        return json({ session });
      },
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          action: "signIn" | "signUp" | "signOut";
          email?: string;
          password?: string;
          fullName?: string;
          organizationName?: string;
          organizationKind?: "personal" | "company";
        };

        if (body.action === "signOut") {
          await destroySession();
          return json(
            { ok: true },
            { headers: { "set-cookie": sessionClearCookieHeader() } },
          );
        }

        if (!body.email || !body.password) {
          return json({ error: { message: "Email and password required" } }, { status: 400 });
        }

        try {
          if (body.action === "signIn") {
            const user = await authenticateUser(body.email, body.password);
            if (!user) {
              return json({ error: { message: "Invalid email or password" } }, { status: 401 });
            }
            const { token, expiresAt } = await createSession(user.id);
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

          if (body.action === "signUp") {
            const user = await provisionNewUser({
              email: body.email,
              password: body.password,
              fullName: body.fullName,
              organizationName: body.organizationName,
              organizationKind: body.organizationKind,
            });
            const { token, expiresAt } = await createSession(user.id);
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
