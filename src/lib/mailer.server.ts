/**
 * Transactional mail. When SMTP is not configured, the message (including
 * invite and reset URLs) is written to the server log so local development works.
 */
export async function sendMail(opts: { to: string; subject: string; text: string }) {
  const host = process.env.SMTP_HOST?.trim();
  console.info(`[mail] to=${opts.to}\nsubject=${opts.subject}\n${opts.text}\n`);
  if (!host) return { delivered: false as const, logged: true as const };
  // SMTP delivery can be wired here without changing call sites.
  return { delivered: false as const, logged: true as const };
}
