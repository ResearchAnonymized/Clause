import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSample(name: string) {
  return readFileSync(resolve(process.cwd(), "public/samples", name), "utf8");
}

/** On-disk demo packs used by the in-app "Load sample packs" control. */
export function loadSamplePackCorpus() {
  const tenderInvitation = readSample("tender-invitation.txt");
  const tenderSlaDpa = readSample("tender-sla-dpa.txt");
  const bidderOffer = readSample("bidder-offer.txt");
  const bidderDpa = readSample("bidder-dpa.txt");
  return {
    tenderInvitation,
    tenderSlaDpa,
    bidderOffer,
    bidderDpa,
    tender: `${tenderInvitation}\n\n${tenderSlaDpa}`,
    bidder: `${bidderOffer}\n\n${bidderDpa}`,
  };
}

/** Quotes that actually appear in the sample pack — a live analysis must be able to cite these. */
export const GROUNDED_QUOTES = {
  tenderAvailability: "99.9% monthly availability",
  tenderP1Restore: "restored within 4 hours",
  tenderBreach: "no later than 24 hours",
  tenderSubprocessors: "notify the customer in writing at least 30 days",
  tenderExit: "provide exit assistance for 90 days",
  bidderAvailability: "99.5% monthly availability",
  bidderP1Restore: "Restore-time objective for Priority-1 is 8 hours",
  bidderBreach: "Target notification window: 72 hours",
  bidderSubprocessors: "United States region for log aggregation",
  bidderExit: "make an export available for 14 days",
} as const;

/** Language a model might invent — must never count as evidence. */
export const HALLUCINATED_QUOTES = [
  "We pinky-promise five nines forever",
  "Personal data never leaves Finland under any circumstances",
  "Unlimited liability for all GDPR fines",
] as const;
