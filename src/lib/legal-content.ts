import { operatorLegalName, privacyEmail, securityEmail } from "@/config/instance";

/**
 * Operator identity for public legal pages. Left empty until env is set —
 * copy then refers to “the operator of this instance”.
 */
export function legalContact() {
  const org = operatorLegalName();
  const email = privacyEmail();
  const security = securityEmail();
  return {
    org,
    orgDisplay: org || "the operator of this instance",
    role: "Data protection contact",
    email,
    emailDisplay: email || "the privacy contact configured for this instance",
    security,
    securityDisplay: security || "the security contact configured for this instance",
  };
}

export const LAST_UPDATED = "1 September 2026";
