import { useEffect, useReducer, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertOctagon, FileText, Scale } from "lucide-react";
import { AgentAvatar, type AgentKind } from "@/components/agent-avatar";
import { cn } from "@/lib/utils";

type Tone = "crit" | "warn" | "ok";
type TFn = (k: string) => string;

type SpecialistKind = "sla" | "dpa" | "infosec" | "notice" | "pricing";
const SPECIALISTS: SpecialistKind[] = ["sla", "dpa", "infosec", "notice", "pricing"];
function isSpecialist(k: string): k is SpecialistKind {
  return (SPECIALISTS as string[]).includes(k);
}
const SHORT: Record<AgentKind, string> = {
  orchestrator: "Orchestrator",
  sla: "SLA",
  dpa: "DPA",
  infosec: "InfoSec",
  notice: "Notice",
  pricing: "Pricing",
  reviewer: "Reviewer",
  gap: "Gap",
};

const FINDINGS: Record<
  Exclude<AgentKind, "orchestrator" | "gap">,
  { tone: Tone; title: string; note: string; left?: string; right?: string }
> = {
  sla: {
    tone: "crit",
    title: "Uptime 99.0% vs required 99.9%",
    note: "Tender is monthly. Bidder is quarterly, with discretionary credits.",
    left: "99.9%",
    right: "99.0%",
  },
  dpa: {
    tone: "crit",
    title: "No signed DPA in the pack",
    note: "Art. 28 processor duties are asserted, not evidenced.",
  },
  infosec: {
    tone: "ok",
    title: "ISO/IEC 27001 certificate present",
    note: "Certificate maps to the named service boundary.",
  },
  notice: {
    tone: "warn",
    title: "12-month notice on auto-renewal",
    note: "Tender asked for 3 months. Exit is one-sided.",
  },
  pricing: {
    tone: "warn",
    title: "CPI escalation uncapped",
    note: "Indexation has no ceiling and no look-back.",
  },
  reviewer: {
    tone: "crit",
    title: "Uptime 99.0% vs required 99.9%",
    note: "Senior review keeps the SLA gap as the material risk.",
    left: "99.9%",
    right: "99.0%",
  },
};

function useCycle(length: number, ms: number, paused: boolean) {
  const [idx, tick] = useReducer((n: number) => (n + 1) % length, 0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || paused) return;
    const id = window.setInterval(tick, ms);
    return () => window.clearInterval(id);
  }, [reduce, paused, ms, tick]);
  return reduce ? 0 : idx;
}

/** Compact hero: packs feed the orchestrator, specialists fire, the gap is the punchline. */
export function LandingHeroOrchestra({ t }: { t: TFn }) {
  const reduce = useReducedMotion();
  const [pinned, setPinned] = useState<AgentKind | null>(null);
  const steps: AgentKind[] = ["orchestrator", ...SPECIALISTS, "reviewer"];
  const idx = useCycle(steps.length, 2200, pinned !== null);
  const active = pinned ?? steps[idx];
  const findingKind: Exclude<AgentKind, "orchestrator" | "gap"> =
    active === "orchestrator" ? "sla" : active === "gap" ? "sla" : active;
  const finding = FINDINGS[findingKind];
  const showSplit = Boolean(finding.left && finding.right);

  return (
    <div className="relative">
      <div className="rounded-2xl border border-white/20 bg-white text-stage shadow-[0_32px_90px_-24px_rgba(6,16,48,0.55)] overflow-hidden ring-1 ring-white/20">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-stage text-white">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-white" />
            </span>
            {t("landing.liveAgents")}
          </span>
          <span className="flex items-center gap-1.5" aria-hidden>
            {steps.map((kind) => (
              <span
                key={kind}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-all duration-300",
                  kind === active ? "bg-white scale-125" : "bg-white/30",
                )}
              />
            ))}
          </span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={active}
            className="px-4 py-2 text-[12px] text-stage/80 bg-[#f4f1ea] border-b border-black/8"
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
          >
            {t(`landing.cycle.${active}`)}
          </motion.p>
        </AnimatePresence>

        <div className="relative px-3 pt-4 pb-2">
          <HeroGraph active={active} t={t} onPin={setPinned} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={findingKind}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-black/10 bg-black/[0.04]">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-stage">
                <AlertOctagon size={14} className="text-stage" />
                {active === "reviewer" ? t("landing.sampleGap") : SHORT[findingKind]}
              </span>
              <ToneChip tone={finding.tone} />
            </div>
            <div className="px-4 py-3.5">
              <p className="text-base font-semibold text-stage">{finding.title}</p>
              <p className="mt-1.5 text-[13px] text-stage/70">{finding.note}</p>
            </div>
            {showSplit ? (
              <div className="grid grid-cols-2 border-t border-black/10">
                <MiniQuote kicker={t("landing.sampleTender")} value={finding.left!} warn={false} />
                <MiniQuote kicker={t("landing.sampleBidder")} value={finding.right!} warn />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function HeroGraph({
  active,
  t,
  onPin,
}: {
  active: AgentKind;
  t: TFn;
  onPin: (k: AgentKind | null) => void;
}) {
  const reduce = useReducedMotion();
  return (
        <div className="relative h-[210px]" onMouseLeave={() => onPin(null)}>
      <svg viewBox="0 0 640 210" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--stage)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--stage)" stopOpacity="0.45" />
          </linearGradient>
        </defs>
        {[
          "M 70 36 H 250",
          "M 570 36 H 390",
          "M 320 58 V 88",
          ...SPECIALISTS.map((_, i) => {
            const x = 64 + i * 128;
            return `M 320 70 Q 320 110 ${x} 132`;
          }),
        ].map((d) => (
          <path
            key={d}
            d={d}
            className={reduce ? undefined : "landing-flow-line"}
            fill="none"
            stroke="url(#heroLine)"
            strokeWidth="1.2"
            strokeDasharray="4 6"
          />
        ))}
        {!reduce && active === "orchestrator" && (
          <>
            <circle key="from-tender" r="3.5" fill="var(--stage)">
              <animateMotion dur="0.9s" repeatCount="1" path="M 70 36 H 250" fill="freeze" />
            </circle>
            <circle key="from-bidder" r="3.5" fill="var(--stage)">
              <animateMotion dur="0.9s" repeatCount="1" path="M 570 36 H 390" fill="freeze" />
            </circle>
          </>
        )}
        {!reduce && isSpecialist(active) && (
          <circle key={`to-${active}`} r="3.5" fill="var(--stage)">
            <animateMotion
              dur="1.1s"
              repeatCount="1"
              path={`M 320 70 Q 320 110 ${64 + SPECIALISTS.indexOf(active) * 128} 132`}
              fill="freeze"
            />
          </circle>
        )}
        {!reduce && active === "reviewer" && (
          <circle key="to-reviewer" r="3.5" fill="var(--stage)">
            <animateMotion dur="1.2s" repeatCount="1" path="M 320 132 V 70" fill="freeze" />
          </circle>
        )}
      </svg>

      <PackChip className="absolute left-0 top-1" label={t("landing.sampleTender")} live={active === "orchestrator"} />
      <PackChip className="absolute right-0 top-1" label={t("landing.sampleBidder")} live={active === "orchestrator"} />

      <button
        type="button"
        className="absolute left-1/2 top-5 -translate-x-1/2 flex flex-col items-center"
        onMouseEnter={() => onPin("orchestrator")}
        onFocus={() => onPin("orchestrator")}
        aria-label={SHORT.orchestrator}
      >
        <AgentAvatar kind="orchestrator" size="md" pulse={active === "orchestrator"} />
        <span className="mt-1 text-[10px] font-medium text-stage/70">{SHORT.orchestrator}</span>
      </button>

      {SPECIALISTS.map((kind, i) => (
        <button
          key={kind}
          type="button"
          className="absolute top-[132px] -translate-x-1/2 flex flex-col items-center"
          style={{ left: `${((64 + i * 128) / 640) * 100}%` }}
          onMouseEnter={() => onPin(kind)}
          onFocus={() => onPin(kind)}
          aria-label={SHORT[kind]}
        >
          <div className={cn("transition-transform duration-300", active === kind ? "scale-110" : "scale-100")}>
            <AgentAvatar kind={kind} size="md" pulse={active === kind} />
          </div>
          <span
            className={cn(
              "mt-1 text-[10px] font-medium",
              active === kind ? "text-stage" : "text-stage/50",
            )}
          >
            {SHORT[kind]}
          </span>
        </button>
      ))}
    </div>
  );
}

function PackChip({ className, label, live }: { className?: string; label: string; live?: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-black/[0.04] px-2 py-1 text-[10px] font-medium text-stage",
        live && "landing-chip-live border-stage/30 bg-stage/8",
        className,
      )}
    >
      <FileText size={11} />
      {label}
    </div>
  );
}

const BOARD_POS: Record<Exclude<AgentKind, "gap">, { x: number; y: number }> = {
  orchestrator: { x: 500, y: 52 },
  sla: { x: 70, y: 168 },
  dpa: { x: 250, y: 210 },
  infosec: { x: 500, y: 228 },
  notice: { x: 750, y: 210 },
  pricing: { x: 930, y: 168 },
  reviewer: { x: 500, y: 368 },
};

function curve(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bow: "up" | "down",
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const offset = Math.min(70, Math.max(36, len * 0.16));
  const sign = bow === "down" ? 1 : -1;
  const midX = (from.x + to.x) / 2 + (-dy / len) * offset * sign;
  const midY = (from.y + to.y) / 2 + (dx / len) * offset * sign + (bow === "down" ? 12 : -8);
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

/** Full board: orchestrator fans out, specialists hand findings to the reviewer. */
export function LandingAgentBoard({ t }: { t: TFn }) {
  const [hovered, setHovered] = useState<SpecialistKind | null>(null);
  const idx = useCycle(SPECIALISTS.length, 2600, hovered !== null);
  const active = hovered ?? SPECIALISTS[idx];
  const finding = FINDINGS[active];
  const reduce = useReducedMotion();
  const pulseDur = 1.8;

  return (
    <div className="rounded-2xl border border-border bg-muted/40 overflow-hidden shadow-[0_20px_50px_-30px_rgba(10,36,114,0.22)]">
      <div className="relative mx-auto w-full aspect-[1000/430] max-h-[440px] bg-[radial-gradient(ellipse_at_center,rgba(10,36,114,0.08),transparent_60%)]">
        <svg viewBox="0 0 1000 430" className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
          <defs>
            <linearGradient id="boardLine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--stage)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--stage)" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          {SPECIALISTS.map((s) => {
            const down = curve(BOARD_POS.orchestrator, BOARD_POS[s], "down");
            const up = curve(BOARD_POS[s], BOARD_POS.reviewer, "up");
            const on = s === active;
            return (
              <g key={s}>
                <path
                  d={down}
                  fill="none"
                  stroke="url(#boardLine)"
                  strokeWidth={on ? 1.8 : 0.9}
                  strokeDasharray={on ? "0" : "4 8"}
                  opacity={on ? 0.95 : 0.28}
                />
                <path
                  d={up}
                  fill="none"
                  stroke="url(#boardLine)"
                  strokeWidth={on ? 1.4 : 0.7}
                  strokeDasharray="3 8"
                  opacity={on ? 0.7 : 0.18}
                />
                {on && !reduce && (
                  <>
                    <circle key={`${s}-down`} r="4" fill="var(--stage)">
                      <animateMotion dur={`${pulseDur}s`} repeatCount="1" path={down} fill="freeze" />
                    </circle>
                    <circle key={`${s}-up`} r="3.2" fill="var(--stage)">
                      <animateMotion
                        dur={`${pulseDur * 0.85}s`}
                        begin={`${pulseDur * 0.45}s`}
                        repeatCount="1"
                        path={up}
                        fill="freeze"
                      />
                    </circle>
                  </>
                )}
              </g>
            );
          })}
        </svg>

        {(Object.keys(BOARD_POS) as Array<keyof typeof BOARD_POS>).map((kind) => {
          const pos = BOARD_POS[kind];
          const spec = isSpecialist(kind);
          const on = kind === active || kind === "orchestrator" || kind === "reviewer";
          const focused = kind === active;
          return (
            <button
              key={kind}
              type="button"
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${(pos.x / 1000) * 100}%`, top: `${(pos.y / 430) * 100}%` }}
              onMouseEnter={() => spec && setHovered(kind)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => spec && setHovered(kind)}
              onBlur={() => setHovered(null)}
              aria-label={t(`agents.${kind}.title`)}
            >
              <div className={cn("transition-all duration-300", focused ? "scale-110" : on ? "scale-100" : "opacity-55")}>
                <AgentAvatar
                  kind={kind}
                  size={kind === "orchestrator" || kind === "reviewer" ? "lg" : "md"}
                  pulse={focused || kind === "orchestrator"}
                />
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[11px] font-medium whitespace-nowrap",
                  focused ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {SHORT[kind]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="border-t border-border bg-muted/40 px-5 py-4 flex items-start gap-3 min-h-[6.5rem]">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            className="flex min-w-0 flex-1 items-start gap-3"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
          >
            <AgentAvatar kind={active} size="sm" pulse />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">{t(`agents.${active}.title`)}</p>
                <ToneChip tone={finding.tone} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{finding.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t(`agents.${active}.does`)}</p>
            </div>
          </motion.div>
        </AnimatePresence>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 pt-1">
          <Scale size={12} /> {t("agents.reviewer.title")}
        </span>
      </div>
    </div>
  );
}

function MiniQuote({ kicker, value, warn }: { kicker: string; value: string; warn?: boolean }) {
  return (
    <div className={`px-4 py-3 ${warn ? "bg-critical/5" : "bg-black/[0.04]"} ${warn ? "" : "border-r border-black/10"}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stage/55">{kicker}</p>
      <motion.p
        key={value + String(warn)}
        className={`mt-1 font-display text-2xl font-semibold ${warn ? "text-critical" : "text-stage"}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        {value}
      </motion.p>
    </div>
  );
}

function ToneChip({ tone }: { tone: Tone }) {
  const map = {
    crit: "bg-critical/12 text-critical",
    warn: "bg-warning/20 text-foreground",
    ok: "bg-ok/15 text-ok",
  };
  const label = tone === "crit" ? "Critical" : tone === "warn" ? "Watch" : "Aligned";
  return (
    <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${map[tone]}`}>
      {label}
    </span>
  );
}
