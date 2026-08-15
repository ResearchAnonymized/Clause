// Buyer-facing vocabulary. DB still stores severity (critical/warning/ok/na).
// This mapper is the only place where we translate to the buyer's language.

export type Severity = "critical" | "warning" | "ok" | "na" | string | null | undefined;
export type Verdict = "gap" | "partial" | "aligned" | "not_addressed";

export function toVerdict(sev: Severity): Verdict {
  if (sev === "critical") return "gap";
  if (sev === "warning") return "partial";
  if (sev === "ok") return "aligned";
  return "not_addressed";
}

export const verdictTone: Record<Verdict, { text: string; bg: string; border: string; dot: string }> = {
  gap:           { text: "text-critical", bg: "bg-critical/10", border: "border-critical/25", dot: "bg-critical" },
  partial:       { text: "text-warning",  bg: "bg-warning/10",  border: "border-warning/25",  dot: "bg-warning" },
  aligned:       { text: "text-ok",       bg: "bg-ok/10",       border: "border-ok/25",       dot: "bg-ok" },
  not_addressed: { text: "text-muted-foreground", bg: "bg-muted/40", border: "border-border", dot: "bg-muted-foreground" },
};

/** CSS modifier for document evidence highlights (PDF / Word / plain text). */
export function evidenceToneClass(verdict: Verdict | null | undefined): string {
  const v = verdict && verdict in verdictTone ? verdict : "not_addressed";
  return `evidence-tone-${v}`;
}

export const verdictI18nKey: Record<Verdict, string> = {
  gap: "verdict.gap",
  partial: "verdict.partial",
  aligned: "verdict.aligned",
  not_addressed: "verdict.notAddressed",
};
