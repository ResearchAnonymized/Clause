/** @vitest-environment node */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeSql, getSql, sqlHealthcheck } from "@/db/pool";
import { hashPassword } from "@/lib/auth/session";
import {
  approveAccessRequest,
  rejectAccessRequest,
  submitAccessRequest,
} from "@/lib/access-requests.server";
import { acceptOrganizationInvite } from "@/lib/organizations.server";
import { loadLocalEnv } from "@/test/env";

loadLocalEnv();

function assertLocalDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const local = /localhost|127\.0\.0\.1|@db[:/]/.test(url);
  if (!local && process.env.ALLOW_DB_TESTS !== "1") {
    throw new Error(
      "Refusing to run DB tests against a non-local DATABASE_URL. Set ALLOW_DB_TESTS=1 if you intend to.",
    );
  }
}

const stamp = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const actorEmail = `counterpart.access.actor.${stamp}@example.test`;
const ownerEmail = `counterpart.access.owner.${stamp}@example.test`;
const otherEmail = `counterpart.access.other.${stamp}@example.test`;
const rejectEmail = `counterpart.access.reject.${stamp}@example.test`;
const orgName = `Access Req ${stamp}`;
const rejectOrg = `Access Reject ${stamp}`;

let dbOk = false;
let actorId = "";
let ownerId = "";
let otherId = "";
const orgIds: string[] = [];

async function insertUser(email: string, name: string) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO users (email, password_hash, full_name, email_verified_at)
    VALUES (${email}, ${hashPassword("Test-password-10")}, ${name}, now())
    RETURNING id
  `;
  const id = rows[0].id as string;
  await sql`INSERT INTO profiles (id, display_name) VALUES (${id}, ${name})`;
  return id;
}

describe("access requests without email", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env and run: docker compose up -d db");
    }
    assertLocalDatabase();
    const health = await sqlHealthcheck();
    if (!health.ok) {
      throw new Error("Postgres is not reachable. Run: docker compose up -d db");
    }
    dbOk = true;
    actorId = await insertUser(actorEmail, "Access Actor");
    ownerId = await insertUser(ownerEmail, "Access Owner");
    otherId = await insertUser(otherEmail, "Access Other");
  });

  afterAll(async () => {
    if (dbOk) {
      const sql = getSql();
      await sql`DELETE FROM access_requests WHERE contact_email LIKE ${`%${stamp}@example.test`}`;
      if (orgIds.length) {
        await sql`DELETE FROM organizations WHERE id = ANY(${orgIds})`;
      }
      await sql`DELETE FROM organizations WHERE name = ANY(${[orgName, rejectOrg]})`;
      await sql`DELETE FROM users WHERE email = ANY(${[actorEmail, ownerEmail, otherEmail, rejectEmail]})`;
    }
    await closeSql();
  });

  it("stores a request without creating an organization", async () => {
    const sql = getSql();
    const before = await sql`SELECT count(*)::int AS n FROM organizations WHERE name = ${orgName}`;
    await submitAccessRequest({
      organizationName: orgName,
      contactEmail: ownerEmail,
      contactName: "Access Owner",
      note: "Faculty review desk",
      ip: "127.0.0.1",
    });
    const after = await sql`SELECT count(*)::int AS n FROM organizations WHERE name = ${orgName}`;
    expect(Number(before[0].n)).toBe(0);
    expect(Number(after[0].n)).toBe(0);
    const pending = await sql`
      SELECT count(*)::int AS n FROM access_requests
      WHERE status = 'pending' AND contact_email = ${ownerEmail} AND organization_name = ${orgName}
    `;
    expect(Number(pending[0].n)).toBe(1);
  });

  it("does not stack a second pending row for the same email and org", async () => {
    const sql = getSql();
    const again = await submitAccessRequest({
      organizationName: `  ${orgName}  `,
      contactEmail: ownerEmail.toUpperCase(),
      contactName: "Access Owner",
    });
    expect(again.alreadyPending).toBe(true);
    const pending = await sql`
      SELECT count(*)::int AS n FROM access_requests
      WHERE status = 'pending' AND lower(contact_email) = ${ownerEmail} AND organization_name = ${orgName}
    `;
    expect(Number(pending[0].n)).toBe(1);
  });

  it("creates an owner invite on approve and rejects the wrong email", async () => {
    const sql = getSql();
    const rows = await sql`
      SELECT id FROM access_requests
      WHERE status = 'pending' AND contact_email = ${ownerEmail} AND organization_name = ${orgName}
      LIMIT 1
    `;
    const approved = await approveAccessRequest({
      requestId: rows[0].id as string,
      actorUserId: actorId,
      workspaceName: "General",
    });
    orgIds.push(approved.organizationId);
    expect(approved.acceptUrl).toContain("/invite/accept?token=");

    const token = new URL(approved.acceptUrl).searchParams.get("token");
    expect(token).toBeTruthy();

    await expect(
      acceptOrganizationInvite({
        token: token!,
        userId: otherId,
        userEmail: otherEmail,
      }),
    ).rejects.toThrow(/invited email/i);

    const joined = await acceptOrganizationInvite({
      token: token!,
      userId: ownerId,
      userEmail: ownerEmail,
    });
    expect(joined.organizationId).toBe(approved.organizationId);
  });

  it("does not create an organization when a request is rejected", async () => {
    const sql = getSql();
    await submitAccessRequest({
      organizationName: rejectOrg,
      contactEmail: rejectEmail,
      contactName: "Rejected Person",
    });
    const rows = await sql`
      SELECT id FROM access_requests
      WHERE status = 'pending' AND contact_email = ${rejectEmail}
      LIMIT 1
    `;
    await rejectAccessRequest({
      requestId: rows[0].id as string,
      actorUserId: actorId,
      reason: "Could not confirm the organization",
    });
    const orgs = await sql`SELECT count(*)::int AS n FROM organizations WHERE name = ${rejectOrg}`;
    expect(Number(orgs[0].n)).toBe(0);
  });

  it("invites the contact into an existing organization", async () => {
    const sql = getSql();
    await submitAccessRequest({
      organizationName: orgName,
      contactEmail: otherEmail,
      contactName: "Access Other",
    });
    const rows = await sql`
      SELECT id, organization_id FROM access_requests
      WHERE status = 'pending' AND contact_email = ${otherEmail}
      LIMIT 1
    `;
    expect(rows[0].organization_id).toBe(orgIds[0]);
    const approved = await approveAccessRequest({
      requestId: rows[0].id as string,
      actorUserId: actorId,
      role: "admin",
    });
    expect(approved.kind).toBe("join");
    expect(approved.organizationId).toBe(orgIds[0]);
    expect(approved.emailed).toBe(false);
    const token = new URL(approved.acceptUrl).searchParams.get("token");
    const joined = await acceptOrganizationInvite({
      token: token!,
      userId: otherId,
      userEmail: otherEmail,
    });
    expect(joined.organizationId).toBe(orgIds[0]);
    const mem = await sql`
      SELECT role FROM organization_members
      WHERE user_id = ${otherId} AND organization_id = ${orgIds[0]}
      LIMIT 1
    `;
    expect(mem[0]?.role).toBe("admin");
  });
});
