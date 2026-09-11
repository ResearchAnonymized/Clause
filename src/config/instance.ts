/** Public product identity. Internals (cookie, DB, Docker) may still say `clause`. */

export const PRODUCT_NAME = "CounterPart";
export const PRODUCT_LETTER = "C";
export const PRODUCT_TAGLINE = "Contract Intelligence";

export type SignupMode = "open" | "invite-only" | "off";

export function signupMode(): SignupMode {
  const v = String(process.env.AUTH_SIGNUP_MODE ?? "invite-only").trim().toLowerCase();
  if (v === "open" || v === "off") return v;
  return "invite-only";
}

export function operatorLegalName(): string {
  return String(process.env.OPERATOR_LEGAL_NAME ?? "").trim();
}

export function privacyEmail(): string {
  return String(process.env.PRIVACY_EMAIL ?? "").trim();
}

export function securityEmail(): string {
  return String(process.env.SECURITY_EMAIL ?? "").trim();
}

export function pageTitle(page?: string) {
  return page ? `${page} — ${PRODUCT_NAME}` : `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`;
}

export function operatorLabel(): string {
  return operatorLegalName() || "the operator of this instance";
}
