import type { AgentKind } from "@/components/agent-avatar";

/** Canonical specialist kinds shown on the Agents page (criteria-backed). */
export const SPECIALIST_KINDS: AgentKind[] = ["sla", "dpa", "infosec", "notice", "pricing"];

/** Always-on pipeline roles (not tied to a single criteria category). */
export const PIPELINE_KINDS = ["orchestrator", "reviewer", "gap"] as const;
export type PipelineKind = (typeof PIPELINE_KINDS)[number];

/** Map a criteria.category string → specialist AgentKind. */
export function categoryToAgentKind(category: string): AgentKind | null {
  const c = category.trim().toLowerCase();
  if (c === "sla" || c.includes("service level")) return "sla";
  if (c === "dpa" || c.includes("gdpr") || c.includes("privacy") || c.includes("data protection")) return "dpa";
  if (c.includes("infosec") || c.includes("info sec") || c === "security" || c.includes("tietoturva")) return "infosec";
  if (c.includes("termin") || c.includes("notice") || c.includes("exit") || c.includes("irtisanom")) return "notice";
  if (c.includes("pric") || c.includes("commercial") || c.includes("hinnoit")) return "pricing";
  return null;
}

/** Preferred display order for criteria categories on the Agents page. */
export const CATEGORY_ORDER = ["SLA", "DPA", "Infosec", "Termination", "Pricing"];

export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const ia = CATEGORY_ORDER.findIndex((x) => x.toLowerCase() === a.toLowerCase());
    const ib = CATEGORY_ORDER.findIndex((x) => x.toLowerCase() === b.toLowerCase());
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.localeCompare(b);
  });
}
