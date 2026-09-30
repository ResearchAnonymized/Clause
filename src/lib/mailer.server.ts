/**
 * Transactional mail. With SMTP_* set, messages are delivered.
 * Without SMTP, the body (including invite URLs) is written to the server log.
 */
import nodemailer from "nodemailer";

export type MailResult =
  | { delivered: true; logged: false }
  | { delivered: false; logged: true; error?: string };

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim());
}

function appOrigin(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function createAccountUrl(): string {
  return `${appOrigin()}/auth?tab=signup`;
}

export function inviteAcceptUrl(token: string): string {
  return `${appOrigin()}/invite/accept?token=${token}`;
}

export function passwordResetUrl(token: string): string {
  return `${appOrigin()}/reset?token=${token}`;
}

export function accessApprovedMail(opts: {
  product: string;
  orgName: string;
  email: string;
  roleLabel: string;
  acceptUrl: string;
}) {
  const signup = createAccountUrl();
  return {
    subject: `You can join ${opts.orgName} on ${opts.product}`,
    text: [
      `You have been approved for ${opts.orgName} on ${opts.product} as ${opts.roleLabel}.`,
      ``,
      `Create an account at:`,
      signup,
      ``,
      `Use this work email: ${opts.email}`,
      `You do not need to paste a join link.`,
      ``,
      `Optional join link (14 days):`,
      opts.acceptUrl,
    ].join("\n"),
  };
}

/** Owner named by GPT-Lab: same join path as any other invite. */
export function ownerInviteMail(opts: {
  product: string;
  orgName: string;
  email: string;
  acceptUrl: string;
}) {
  return accessApprovedMail({
    ...opts,
    roleLabel: "Owner",
  });
}

export function colleagueInviteMail(opts: {
  product: string;
  orgName?: string;
  email: string;
  acceptUrl: string;
}) {
  const signup = createAccountUrl();
  const where = opts.orgName ? ` ${opts.orgName} on` : "";
  return {
    subject: `Join${opts.orgName ? ` ${opts.orgName}` : ""} on ${opts.product}`,
    text: [
      `You have been invited to${where} ${opts.product}.`,
      ``,
      `Create an account at:`,
      signup,
      ``,
      `Use this work email: ${opts.email}`,
      `You do not need to paste a join link.`,
      ``,
      `Optional join link (14 days):`,
      opts.acceptUrl,
    ].join("\n"),
  };
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<MailResult> {
  const host = process.env.SMTP_HOST?.trim();
  console.info(`[mail] to=${opts.to}\nsubject=${opts.subject}\n${opts.text}\n`);
  if (!host) return { delivered: false, logged: true };

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from =
    process.env.SMTP_FROM?.trim() ||
    process.env.PRIVACY_EMAIL?.trim() ||
    (user && user.includes("@") ? user : `noreply@${host}`);

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });
    return { delivered: true, logged: false };
  } catch (err) {
    const error = String((err as Error)?.message ?? err).slice(0, 240);
    console.warn("[mail] SMTP delivery failed", error);
    return { delivered: false, logged: true, error };
  }
}
