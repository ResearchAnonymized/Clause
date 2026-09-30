import { getSql } from "@/db/pool";
import { PRODUCT_NAME } from "@/config/instance";
import { sendMail } from "@/lib/mailer.server";

export async function notifyPlatformAdmins(opts: {
  title: string;
  body: string;
  link?: string;
  emailSubject?: string;
  emailText?: string;
  exceptUserId?: string;
}) {
  const sql = getSql();
  const admins = opts.exceptUserId
    ? await sql`
        SELECT u.id, u.email
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        WHERE ur.role = 'admin'::app_role
          AND u.deactivated_at IS NULL
          AND u.id <> ${opts.exceptUserId}
      `
    : await sql`
        SELECT u.id, u.email
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        WHERE ur.role = 'admin'::app_role
          AND u.deactivated_at IS NULL
      `;
  for (const admin of admins) {
    try {
      await sql`
        INSERT INTO notifications (user_id, kind, title, body, link)
        VALUES (
          ${admin.id as string},
          ${"access"},
          ${opts.title},
          ${opts.body},
          ${opts.link ?? "/admin"}
        )
      `;
      if (opts.emailSubject && opts.emailText) {
        await sendMail({
          to: String(admin.email),
          subject: opts.emailSubject,
          text: opts.emailText,
        });
      }
    } catch (err) {
      console.warn("platform admin notice failed", err);
    }
  }
}

export function joinRequestNotice(opts: { name: string; email: string; orgName: string }) {
  const title = "Join request";
  const body = `${opts.name} (${opts.email}) asked to join ${opts.orgName}.`;
  return {
    title,
    body,
    link: "/admin",
    emailSubject: `${title} — ${PRODUCT_NAME}`,
    emailText: `${body}\n\nReview it at ${process.env.APP_URL || "http://localhost:3000"}/admin\n`,
  };
}

export function someoneJoinedNotice(opts: { email: string; orgName: string; roleLabel: string }) {
  const title = "Someone joined";
  const body = `${opts.email} created an account and joined ${opts.orgName} as ${opts.roleLabel}.`;
  return {
    title,
    body,
    link: "/admin",
    emailSubject: `${title} — ${PRODUCT_NAME}`,
    emailText: `${body}\n\nOpen People at ${process.env.APP_URL || "http://localhost:3000"}/admin\n`,
  };
}
