/** @vitest-environment node */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeSql, getSql, sqlHealthcheck } from "@/db/pool";
import { hashPassword } from "@/lib/auth/session";
import {
  acceptOrganizationInvite,
  assertCanMutateWorkspaceWork,
  assertOrgMembership,
  assertWorkspaceInUserOrg,
  createOrganizationInvite,
  provisionOrganizationForOwnerInvite,
  provisionOrganizationForUser,
} from "@/lib/organizations.server";
import { VIEWER_MUTATION_DENIED } from "@/lib/organizations";
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
const emailC = `counterpart.test.c.${stamp}@example.test`;
const emailD = `counterpart.test.d.${stamp}@example.test`;

let dbOk = false;
let userA = "";
let userB = "";
let orgA = "";
let workspaceA = "";
let orgB = "";
let workspaceB = "";
let userC = "";
let userD = "";

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
    userC = await insertUser(emailC, "Test Reviewer C");
    userD = await insertUser(emailD, "Test Owner D");
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
      await sql`DELETE FROM users WHERE email = ANY(${[emailA, emailB, emailC, emailD]})`;
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

  it("invites a person only into the named workspace", async () => {
    const sql = getSql();
    const { uniqueSlug } = await import("@/lib/organizations");
    const ws = await sql`
      INSERT INTO workspaces (name, slug, owner_id, organization_id)
      VALUES (
        ${`Matter ${stamp}`},
        ${uniqueSlug("matter", orgA)},
        ${userA},
        ${orgA}
      )
      RETURNING id
    `;
    const matterId = ws[0].id as string;
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${matterId}, ${userA}, 'owner'::workspace_role)
      ON CONFLICT DO NOTHING
    `;

    const invite = await createOrganizationInvite({
      organizationId: orgA,
      email: emailC,
      role: "member",
      invitedBy: userA,
      workspaceIds: [matterId],
      workspaceRole: "reviewer",
    });
    const accepted = await acceptOrganizationInvite({
      token: invite.token,
      userId: userC,
      userEmail: emailC,
    });
    expect(accepted.workspaceId).toBe(matterId);
    await expect(assertWorkspaceInUserOrg(userC, matterId)).resolves.toMatchObject({
      organizationId: orgA,
    });
    await expect(assertWorkspaceInUserOrg(userC, workspaceA)).rejects.toThrow(/not accessible/i);
  });

  it("blocks viewers from mutating workspace work", async () => {
    const sql = getSql();
    await sql`
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES (${workspaceB}, ${userC}, 'viewer'::workspace_role)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'viewer'::workspace_role
    `;
    await expect(assertCanMutateWorkspaceWork(userC, workspaceB)).rejects.toThrow(
      VIEWER_MUTATION_DENIED,
    );
    await expect(assertCanMutateWorkspaceWork(userB, workspaceB)).resolves.toMatchObject({
      role: "owner",
    });
  });

  it("lets GPT-Lab provision an org without joining it", async () => {
    const provisioned = await provisionOrganizationForOwnerInvite({
      name: `Customer ${stamp}`,
      ownerEmail: emailD,
      createdBy: userA,
      workspaceName: "General",
    });
    await expect(assertOrgMembership(userA, provisioned.organizationId)).rejects.toThrow(
      /not an organization member/i,
    );
    const accepted = await acceptOrganizationInvite({
      token: provisioned.token,
      userId: userD,
      userEmail: emailD,
    });
    expect(accepted.organizationId).toBe(provisioned.organizationId);
    await expect(
      assertOrgMembership(userD, provisioned.organizationId, ["owner"]),
    ).resolves.toMatchObject({ role: "owner" });
  });

  it("reissues a copyable owner join link", async () => {
    const provisioned = await provisionOrganizationForOwnerInvite({
      name: `Reissue ${stamp}`,
      ownerEmail: emailD,
      createdBy: userA,
    });
    const { reissueOwnerInvite } = await import("@/lib/organizations.server");
    const again = await reissueOwnerInvite({
      organizationId: provisioned.organizationId,
      actorUserId: userA,
    });
    expect(again.acceptUrl).toContain("/invite/accept?token=");
    expect(again.email.toLowerCase()).toBe(emailD);
    expect(again.acceptUrl).not.toContain(provisioned.token);
  });
});
