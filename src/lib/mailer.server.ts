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

export function inviteAcceptUrl(token: string): string {
  const origin = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${origin}/invite/accept?token=${token}`;
}

/** Owner named by GPT-Lab: same join path as any other invite. */
export function ownerInviteMail(opts: {
  product: string;
  orgName: string;
  email: string;
  acceptUrl: string;
}) {
  return {
    subject: `Join ${opts.orgName} on ${opts.product}`,
    text: [
      `You have been named the responsible person for ${opts.orgName} on ${opts.product}.`,
      ``,
      `Join in the usual way:`,
      `1. Open this invite: ${opts.acceptUrl}`,
      `2. Create an account or sign in with ${opts.email}`,
      `3. Join the organization. You can then invite your colleagues.`,
      ``,
      `This link expires in 14 days.`,
    ].join("\n"),
  };
}

export function colleagueInviteMail(opts: {
  product: string;
  orgName?: string;
  email: string;
  acceptUrl: string;
}) {
  const where = opts.orgName ? ` ${opts.orgName} on` : "";
  return {
    subject: `Join${opts.orgName ? ` ${opts.orgName}` : ""} on ${opts.product}`,
    text: [
      `You have been invited to${where} ${opts.product}.`,
      ``,
      `Join in the usual way:`,
      `1. Open this invite: ${opts.acceptUrl}`,
      `2. Create an account or sign in with ${opts.email}`,
      `3. Join the organization.`,
      ``,
      `This link expires in 14 days.`,
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
