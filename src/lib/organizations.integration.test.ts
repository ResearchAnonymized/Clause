/** @vitest-environment node */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeSql, getSql, sqlHealthcheck } from "@/db/pool";
import { hashPassword } from "@/lib/auth/session";
import {
  acceptOrganizationInvite,
  assertOrgMembership,
  assertWorkspaceInUserOrg,
  createOrganizationInvite,
  provisionOrganizationForUser,
} from "@/lib/organizations.server";
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
const emailA = `counterpart.test.a.${stamp}@example.test`;
const emailB = `counterpart.test.b.${stamp}@example.test`;

let dbOk = false;
let userA = "";
let userB = "";
let orgA = "";
let workspaceA = "";
let orgB = "";
let workspaceB = "";

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

describe("postgres tenant isolation", () => {
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

    userA = await insertUser(emailA, "Test Owner A");
    userB = await insertUser(emailB, "Test Member B");
    const a = await provisionOrganizationForUser({
      userId: userA,
      orgName: `Vitest Org A ${stamp}`,
      kind: "company",
    });
    orgA = a.organizationId;
    workspaceA = a.workspaceId;
    const b = await provisionOrganizationForUser({
      userId: userB,
      orgName: `Vitest Org B ${stamp}`,
      kind: "personal",
    });
    orgB = b.organizationId;
    workspaceB = b.workspaceId;
  });

  afterAll(async () => {
    if (dbOk) {
      const sql = getSql();
      await sql`DELETE FROM users WHERE email = ANY(${[emailA, emailB]})`;
    }
    await closeSql();
  });

  it("provisions a distinct org and workspace per user", async () => {
    expect(orgA).not.toBe(orgB);
    expect(workspaceA).not.toBe(workspaceB);
    await expect(assertOrgMembership(userA, orgA, ["owner"])).resolves.toMatchObject({ role: "owner" });
    await expect(assertOrgMembership(userB, orgA)).rejects.toThrow(/not an organization member/i);
  });

  it("blocks workspace access across tenants", async () => {
    await expect(assertWorkspaceInUserOrg(userA, workspaceA)).resolves.toMatchObject({ organizationId: orgA });
    await expect(assertWorkspaceInUserOrg(userA, workspaceB)).rejects.toThrow(/not accessible/i);
    await expect(assertWorkspaceInUserOrg(userB, workspaceA)).rejects.toThrow(/not accessible/i);
  });

  it("lets an invited user join the other org and then see that workspace", async () => {
    const invite = await createOrganizationInvite({
      organizationId: orgA,
      email: emailB,
      role: "member",
      invitedBy: userA,
    });
    expect(invite.token).toHaveLength(64);

    const accepted = await acceptOrganizationInvite({
      token: invite.token,
      userId: userB,
      userEmail: emailB,
    });
    expect(accepted.organizationId).toBe(orgA);
    expect(accepted.workspaceId).toBe(workspaceA);

    await expect(assertOrgMembership(userB, orgA, ["member"])).resolves.toMatchObject({ role: "member" });
    await expect(assertWorkspaceInUserOrg(userB, workspaceA)).resolves.toMatchObject({ organizationId: orgA });
  });

  it("rejects accepting an invite with the wrong email", async () => {
    const invite = await createOrganizationInvite({
      organizationId: orgB,
      email: "someone-else@example.test",
      role: "admin",
      invitedBy: userB,
    });
    await expect(
      acceptOrganizationInvite({ token: invite.token, userId: userA, userEmail: emailA }),
    ).rejects.toThrow(/invited email/i);
  });
});
