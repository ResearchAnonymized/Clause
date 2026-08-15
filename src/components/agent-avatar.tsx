import { Scale, ShieldCheck, Timer, CalendarClock, Coins, FileSearch, Sparkles, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type AgentKind =
  | "orchestrator"
  | "sla"
  | "dpa"
  | "infosec"
  | "notice"
  | "pricing"
  | "reviewer"
  | "gap";

const AGENTS: Record<
  AgentKind,
  { label: string; role: string; Icon: typeof Scale; tone: string }
> = {
  orchestrator: { label: "Review Orchestrator",                 role: "Plans & routes work",         Icon: Sparkles,     tone: "bg-brand text-brand-foreground" },
  sla:          { label: "Service Level Agreement Analyst",     role: "Uptime & service credits",    Icon: Timer,        tone: "bg-[oklch(0.55_0.15_240)] text-white" },
  dpa:          { label: "Data Protection & GDPR Analyst",      role: "GDPR & data processing",      Icon: ShieldCheck,  tone: "bg-[oklch(0.5_0.14_160)] text-white" },
  infosec:      { label: "Information Security Analyst",        role: "Controls & ISO/IEC 27001",    Icon: ShieldCheck,  tone: "bg-[oklch(0.5_0.16_25)] text-white" },
  notice:       { label: "Termination & Notice Period Analyst", role: "Notice, renewal & exit",      Icon: CalendarClock,tone: "bg-[oklch(0.55_0.13_60)] text-white" },
  pricing:      { label: "Pricing & Commercial Terms Analyst",  role: "Indexation, caps & fees",     Icon: Coins,        tone: "bg-[oklch(0.55_0.14_300)] text-white" },
  reviewer:     { label: "Senior Legal Reviewer",               role: "Final synthesis & verdict",   Icon: Scale,        tone: "bg-[oklch(0.35_0.12_265)] text-white" },
  gap:          { label: "Gap Analysis Agent",                  role: "Risks outside the library",   Icon: FileSearch,   tone: "bg-[oklch(0.45_0.08_250)] text-white" },
};

export function AgentAvatar({
  kind,
  size = "md",
  pulse = false,
  className,
}: {
  kind: AgentKind;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
}) {
  const a = AGENTS[kind] ?? AGENTS.orchestrator;
  const dim = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const icon = size === "lg" ? 26 : size === "sm" ? 16 : 20;
  return (
    <div className={cn("relative inline-flex items-center justify-center rounded-full ring-2 ring-white/60 shadow-sm", a.tone, dim, className)}>
      <a.Icon size={icon} strokeWidth={2} />
      {pulse && (
        <span className="absolute inset-0 rounded-full animate-ping bg-current opacity-20" aria-hidden />
      )}
    </div>
  );
}

export function AgentCard({ kind, active = false }: { kind: AgentKind; active?: boolean }) {
  const a = AGENTS[kind];
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border bg-card p-3 transition-all",
      active ? "border-brand shadow-sm -translate-y-0.5" : "border-border"
    )}>
      <AgentAvatar kind={kind} pulse={active} />
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{a.label}</div>
        <div className="text-xs text-muted-foreground truncate">{a.role}</div>
      </div>
      {active && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-brand">Working</span>}
    </div>
  );
}

const PIPELINE: { kind: AgentKind; finding: { severity: "critical" | "warning" | "ok"; text: string } }[] = [
  { kind: "sla",     finding: { severity: "critical", text: "SLA response 24h vs required 4h" } },
  { kind: "notice",  finding: { severity: "warning",  text: "Asymmetric notice period §11" } },
  { kind: "dpa",     finding: { severity: "critical", text: "Sub-processor list missing" } },
  { kind: "infosec", finding: { severity: "ok",       text: "ISO 27001 controls verified" } },
  { kind: "pricing", finding: { severity: "warning",  text: "Annual CPI indexation uncapped" } },
];

const SEV_STYLE = {
  critical: { dot: "bg-critical", label: "Critical", Icon: AlertTriangle, tone: "text-critical" },
  warning:  { dot: "bg-warn",     label: "Warning",  Icon: AlertTriangle, tone: "text-warn" },
  ok:       { dot: "bg-ok",       label: "OK",       Icon: CheckCircle2,  tone: "text-ok" },
} as const;

export function AgentOrchestraDemo() {
  // step: -1 = input arriving, 0..PIPELINE.length-1 = agent working, PIPELINE.length = done
  const [step, setStep] = useState(-1);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s >= PIPELINE.length ? -1 : s + 1));
    }, 1100);
    return () => clearInterval(id);
  }, []);

  const activeIdx = step;
  const completed = Math.max(0, Math.min(step, PIPELINE.length));

  return (
    <div className="space-y-4">
      {/* Input row */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-brand-soft/40 p-3">
        <div className="h-9 w-9 rounded-md bg-brand/10 text-brand grid place-items-center shrink-0">
          <FileText size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">Supplier draft</div>
          <div className="text-sm font-medium truncate">acme-msa-v3.pdf</div>
        </div>
        <div className="relative h-1.5 w-16 rounded-full bg-border overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-brand transition-all duration-500 ease-out"
            style={{ width: `${((completed) / PIPELINE.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Agents rail */}
      <div className="flex items-center justify-between gap-1">
        {PIPELINE.map((p, i) => {
          const isActive = i === activeIdx;
          const isDone = i < activeIdx || step === PIPELINE.length;
          return (
            <div key={p.kind} className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
              <div className={cn(
                "transition-all duration-300",
                isActive ? "scale-110" : isDone ? "opacity-100" : "opacity-40"
              )}>
                <AgentAvatar kind={p.kind} size="sm" pulse={isActive} />
              </div>
              <div className={cn(
                "h-1 w-full rounded-full transition-colors duration-500",
                isDone ? "bg-brand" : isActive ? "bg-brand/40" : "bg-border"
              )} />
            </div>
          );
        })}
      </div>

      {/* Findings stream */}
      <div className="rounded-lg border border-border bg-background/60 p-3 min-h-[128px]">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Findings</div>
        <ul className="space-y-1.5">
          {PIPELINE.slice(0, completed).map((p, i) => {
            const s = SEV_STYLE[p.finding.severity];
            return (
              <li
                key={p.kind + i}
                className="flex items-center gap-2 text-xs animate-in fade-in slide-in-from-left-2 duration-300"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", s.dot)} />
                <span className="font-medium text-foreground/80 shrink-0">{AGENTS[p.kind].label.replace(" Agent", "")}</span>
                <span className="text-muted-foreground truncate">{p.finding.text}</span>
                <s.Icon size={12} className={cn("ml-auto shrink-0", s.tone)} />
              </li>
            );
          })}
          {completed === 0 && (
            <li className="text-xs text-muted-foreground italic">Waiting for orchestrator…</li>
          )}
        </ul>
      </div>
    </div>
  );
}

export { AGENTS, FileSearch };
