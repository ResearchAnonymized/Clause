import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getSql } from "@/db/pool";
import { buildClearCookie, buildSetCookie, readCookie } from "@/lib/auth/cookies";

export const SESSION_COOKIE = "clause_session";
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  email: string;
  user_metadata: { full_name?: string | null; name?: string | null; avatar_url?: string | null };
};

export type AuthSession = {
  access_token: string;
  user: AuthUser;
  expires_at: number;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  return prev.length === next.length && timingSafeEqual(prev, next);
}

function toAuthUser(row: any): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email),
    user_metadata: {
      full_name: row.full_name ?? null,
      name: row.full_name ?? null,
      avatar_url: row.avatar_url ?? null,
    },
  };
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const sql = getSql();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (${userId}, ${hashToken(token)}, ${expiresAt})
  `;
  return { token, expiresAt };
}

export function sessionSetCookieHeader(token: string, expiresAt: Date) {
  return buildSetCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function sessionClearCookieHeader() {
  return buildClearCookie(SESSION_COOKIE);
}

export async function getSessionFromRequest(): Promise<AuthSession | null> {
  const token = readCookie(SESSION_COOKIE);
  if (!token) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT s.expires_at, u.id, u.email, u.full_name, u.avatar_url
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
      AND s.expires_at > now()
      AND u.deactivated_at IS NULL
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    access_token: token,
    user: toAuthUser(row),
    expires_at: Math.floor(new Date(row.expires_at).getTime() / 1000),
  };
}

export async function destroySession() {
  const token = readCookie(SESSION_COOKIE);
  if (token) {
    const sql = getSql();
    await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  }
}

export async function destroyAllSessions(userId: string) {
  const sql = getSql();
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
}

export async function countUsers(): Promise<number> {
  const sql = getSql();
  const rows = await sql`SELECT count(*)::int AS c FROM users`;
  return Number(rows[0]?.c ?? 0);
}

export function assertPasswordPolicy(password: string) {
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must include a letter and a number");
  }
}

export async function issueAuthToken(opts: {
  purpose: "reset" | "verify";
  userId?: string;
  email?: string;
  hours?: number;
}): Promise<string> {
  const sql = getSql();
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + (opts.hours ?? 2) * 60 * 60 * 1000);
  await sql`
    INSERT INTO auth_tokens (user_id, email, purpose, token_hash, expires_at)
    VALUES (
      ${opts.userId ?? null},
      ${opts.email ?? null},
      ${opts.purpose},
      ${hashToken(token)},
      ${expiresAt}
    )
  `;
  return token;
}

export async function consumeAuthToken(token: string, purpose: "reset" | "verify") {
  const sql = getSql();
  const rows = await sql`
    SELECT id, user_id, email, expires_at, used_at
    FROM auth_tokens
    WHERE token_hash = ${hashToken(token)} AND purpose = ${purpose}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Invalid or expired link");
  if (row.used_at) throw new Error("This link was already used");
  if (new Date(row.expires_at) < new Date()) throw new Error("This link has expired");
  await sql`UPDATE auth_tokens SET used_at = now() WHERE id = ${row.id}`;
  return { userId: row.user_id as string | null, email: row.email as string | null };
}

export async function provisionNewUser(opts: {
  email: string;
  password: string;
  fullName?: string;
  organizationName?: string;
  organizationKind?: "personal" | "company";
  inviteToken?: string;
}): Promise<AuthUser> {
  assertPasswordPolicy(opts.password);
  const sql = getSql();
  const passwordHash = hashPassword(opts.password);
  const email = opts.email.trim().toLowerCase();
  const fullName = opts.fullName?.trim() || email.split("@")[0];

  const users = await sql`
    INSERT INTO users (email, password_hash, full_name)
    VALUES (${email}, ${passwordHash}, ${fullName})
    RETURNING id, email, full_name, avatar_url
  `;
  const user = users[0];

  await sql`
    INSERT INTO profiles (id, display_name)
    VALUES (${user.id}, ${fullName})
  `;

  const roleCount = await sql`SELECT count(*)::int AS c FROM user_roles`;
  const role = (roleCount[0]?.c ?? 0) === 0 ? "admin" : "reviewer";
  await sql`
    INSERT INTO user_roles (user_id, role)
    VALUES (${user.id}, ${role}::app_role)
    ON CONFLICT DO NOTHING
  `;

  if (opts.inviteToken) {
    const { acceptOrganizationInvite } = await import("@/lib/organizations.server");
    await acceptOrganizationInvite({
      token: opts.inviteToken,
      userId: user.id,
      userEmail: email,
    });
    return toAuthUser(user);
  }

  const kind = opts.organizationKind ?? (opts.organizationName ? "company" : "personal");
  const orgName =
    opts.organizationName?.trim() ||
    (kind === "company" ? `${fullName}'s company` : fullName);

  const { provisionOrganizationForUser } = await import("@/lib/organizations.server");
  await provisionOrganizationForUser({
    userId: user.id,
    orgName,
    kind,
    workspaceName: `${orgName} workspace`,
  });

  return toAuthUser(user);
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, email, full_name, avatar_url, password_hash, deactivated_at
    FROM users
    WHERE email = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row?.password_hash) return null;
  if (row.deactivated_at) throw new Error("This account has been deactivated");
  if (!verifyPassword(password, row.password_hash)) return null;
  return toAuthUser(row);
}

export async function setPasswordForUser(userId: string, password: string) {
  assertPasswordPolicy(password);
  const sql = getSql();
  await sql`UPDATE users SET password_hash = ${hashPassword(password)}, updated_at = now() WHERE id = ${userId}`;
  await destroyAllSessions(userId);
}
