/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { colleagueInviteMail, inviteAcceptUrl, mailConfigured, ownerInviteMail, sendMail } from "@/lib/mailer.server";

describe("invite mail", () => {
  it("sends owners through the standard accept link", () => {
    const url = inviteAcceptUrl("a".repeat(64));
    expect(url).toContain("/invite/accept?token=");
    const mail = ownerInviteMail({
      product: "Counterpart",
      orgName: "North Shore Counsel",
      email: "owner@firm.fi",
      acceptUrl: url,
    });
    expect(mail.subject).toContain("North Shore Counsel");
    expect(mail.text).toContain(url);
    expect(mail.text).toMatch(/Create an account or sign in with owner@firm\.fi/);
    expect(mail.text).toMatch(/do not need to paste a link/);
  });

  it("uses the same join steps for colleagues", () => {
    const url = inviteAcceptUrl("b".repeat(64));
    const mail = colleagueInviteMail({
      product: "Counterpart",
      orgName: "North Shore Counsel",
      email: "reviewer@firm.fi",
      acceptUrl: url,
    });
    expect(mail.text).toContain(url);
    expect(mail.text).toMatch(/Create an account or sign in/);
    expect(mail.text).toMatch(/do not need to paste a link/);
  });

  it("logs instead of sending when SMTP is not configured", async () => {
    const prev = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    const result = await sendMail({
      to: "nobody@example.test",
      subject: "Test",
      text: "Hello",
    });
    if (prev !== undefined) process.env.SMTP_HOST = prev;
    expect(result.delivered).toBe(false);
    expect(result.logged).toBe(true);
    expect(mailConfigured()).toBe(false);
  });
});
