import { useEffect, useReducer, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Pause, Play, Gauge } from "lucide-react";
import { AgentAvatar, type AgentKind } from "@/components/agent-avatar";
import { cn } from "@/lib/utils";

/**
 * Humanised, animated "team" diagram of the specialist agents.
 * - Sequential (step-by-step) pulse across specialists.
 * - Detail strip slides in ONLY when a node is focused (hover/tap).
 * - User controls: play/pause + speed (0.5x / 1x / 2x).
 * - Extra breathing room; on small screens the arc collapses to a tighter set.
 */

type ConstellationKind = Exclude<AgentKind, "gap">;

const SPECIALISTS: ConstellationKind[] = ["sla", "dpa", "infosec", "notice", "pricing"];

// Desktop layout (wider viewBox, more margin around every node).
const POS_LG: Record<ConstellationKind, { x: number; y: number }> = {
  orchestrator: { x: 560, y:  90 },
  sla:          { x:  80, y: 330 },
  dpa:          { x: 300, y: 410 },
  infosec:      { x: 560, y: 440 },
  notice:       { x: 820, y: 410 },
  pricing:      { x: 1040, y: 330 },
  reviewer:     { x: 560, y: 610 },
};

// Mobile layout — hide two flank specialists visually via `hiddenSm`,
// keep spacing generous on the remaining three.
const HIDDEN_SM: AgentKind[] = ["sla", "pricing"];

const SPEEDS = [
  { label: "0.5x", ms: 5600 },
  { label: "1x",   ms: 2800 },
  { label: "2x",   ms: 1400 },
] as const;

/**
 * Compute a quadratic Bézier control point that always produces a visible
 * curved arc, even when the two endpoints share an axis (which would
 * otherwise collapse the curve to an invisible straight line).
 *
 * `bow` = "down" bends the arc downward (used for orchestrator → specialists,
 *          which sit below the orchestrator), "up" bends it upward
 *          (used for specialists → reviewer, which sits below them but where
 *          we want the pulse to arc outward, not overlap the down-arcs).
 */
function curveControl(
  from: { x: number; y: number },
  to: { x: number; y: number },
  bow: "up" | "down",
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular unit vector (rotate 90°): (-dy, dx) / len
  const px = -dy / len;
  const py = dx / len;
  // Offset scales with segment length but is clamped so short segments
  // still bow noticeably and long segments don't fly off-canvas.
  const offset = Math.min(90, Math.max(40, len * 0.18));
  const sign = bow === "down" ? 1 : -1;
  // Bias horizontal endpoints downward/upward; vertical endpoints sideways.
  const midX = (from.x + to.x) / 2 + px * offset * sign;
  const midY = (from.y + to.y) / 2 + py * offset * sign + (bow === "down" ? 20 : -10);
  return { midX, midY };
}


export function AgentConstellation() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [activeIdx, tick] = useReducer((n: number) => (n + 1) % SPECIALISTS.length, 0);
  const [hovered, setHovered] = useState<AgentKind | null>(null);
  const [paused, setPaused] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [hydrated, setHydrated] = useState(false);
  const timerRef = useRef<number | null>(null);

  const intervalMs = SPEEDS[speedIdx].ms;

  // Hydrate persisted controls after mount (SSR-safe).
  useEffect(() => {
    try {
      const p = localStorage.getItem("constellation.paused");
      const s = localStorage.getItem("constellation.speedIdx");
      if (p !== null) setPaused(p === "1");
      if (s !== null) {
        const idx = Number(s);
        if (Number.isInteger(idx) && idx >= 0 && idx < SPEEDS.length) setSpeedIdx(idx);
      }
    } catch {
      /* storage unavailable */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("constellation.paused", paused ? "1" : "0"); } catch { /* ignore */ }
  }, [paused, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem("constellation.speedIdx", String(speedIdx)); } catch { /* ignore */ }
  }, [speedIdx, hydrated]);

  useEffect(() => {
    if (reduce || paused || hovered) return;
    timerRef.current = window.setInterval(tick, intervalMs);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [reduce, paused, hovered, intervalMs]);

  const activeKind = SPECIALISTS[activeIdx];
  const focus = hovered ?? activeKind;
  const pulseDur = (intervalMs / 1000) * 0.85;

  return (
    <div className="relative w-full">
      {/* Ambient glow */}
      <div className="absolute inset-0 -z-10 rounded-3xl bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--brand)_14%,transparent),transparent_65%)]" />

      <div
        className="relative mx-auto w-full max-w-5xl aspect-[1120/680]"
        onMouseLeave={() => setHovered(null)}
      >
        <svg
          viewBox="0 0 1120 680"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="oklch(0.55 0.16 260)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="oklch(0.55 0.15 240)" stopOpacity="0.2" />
            </linearGradient>
            <radialGradient id="pulseGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="oklch(0.78 0.16 240)" stopOpacity="1" />
              <stop offset="100%" stopColor="oklch(0.78 0.16 240)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Orchestrator -> specialists */}
          {SPECIALISTS.map((s) => {
            const from = POS_LG.orchestrator;
            const to = POS_LG[s];
            const { midX, midY } = curveControl(from, to, "down");
            const d = `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
            const isActive = s === activeKind && !hovered && !paused;
            const isFocused = s === focus;
            return (
              <g key={`o-${s}`} className={cn(HIDDEN_SM.includes(s) && "hidden sm:inline")}>
                <path
                  d={d}
                  fill="none"
                  stroke="url(#lineGrad)"
                  strokeWidth={isFocused ? 1.8 : 0.9}
                  strokeDasharray={isFocused ? "0" : "4 8"}
                  className="transition-all duration-500"
                  opacity={isFocused ? 0.95 : 0.25}
                />
                {isActive && !reduce && (
                  <circle r="4.5" fill="url(#pulseGrad)">
                    <animateMotion dur={`${pulseDur}s`} repeatCount="1" path={d} fill="freeze" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Specialist -> reviewer (only the currently active one) */}
          {SPECIALISTS.map((s) => {
            const from = POS_LG[s];
            const to = POS_LG.reviewer;
            const { midX, midY } = curveControl(from, to, "up");
            const d = `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
            const isActive = s === activeKind && !hovered && !paused;
            const isFocused = s === focus;
            return (
              <g key={`r-${s}`} className={cn(HIDDEN_SM.includes(s) && "hidden sm:inline")}>
                <path
                  d={d}
                  fill="none"
                  stroke="url(#lineGrad)"
                  strokeWidth={isFocused ? 1.4 : 0.6}
                  strokeDasharray="3 9"
                  opacity={isFocused ? 0.65 : 0.15}
                  className="transition-all duration-500"
                />
                {isActive && !reduce && (
                  <circle r="3.5" fill="url(#pulseGrad)">
                    <animateMotion
                      dur={`${pulseDur * 0.9}s`}
                      begin={`${pulseDur * 0.5}s`}
                      repeatCount="1"
                      path={d}
                      fill="freeze"
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {(Object.keys(POS_LG) as ConstellationKind[]).map((kind) => {
          const isCenter = kind === "orchestrator" || kind === "reviewer";
          const isFocused = kind === focus;
          const isActive = kind === activeKind && !hovered && !paused && SPECIALISTS.includes(kind);
          const dim = !isFocused && hovered !== null;
          return (
            <ConstellationNode
              key={kind}
              kind={kind}
              x={POS_LG[kind].x}
              y={POS_LG[kind].y}
              size={isCenter ? "lg" : "md"}
              active={isActive}
              focused={isFocused}
              dim={dim}
              hiddenSm={HIDDEN_SM.includes(kind)}
              label={t(`agents.${kind}.title`)}
              onHover={(v) => setHovered(v ? kind : null)}
              reduceMotion={!!reduce}
            />
          );
        })}
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 backdrop-blur px-3 py-1.5 hover:bg-accent transition-colors"
          aria-label={paused ? "Play animation" : "Pause animation"}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
        <div className="inline-flex items-center rounded-full border border-border bg-card/70 backdrop-blur overflow-hidden">
          <span className="pl-3 pr-2 text-muted-foreground inline-flex items-center gap-1">
            <Gauge className="h-3.5 w-3.5" /> Speed
          </span>
          {SPEEDS.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSpeedIdx(i)}
              className={cn(
                "px-2.5 py-1.5 transition-colors",
                i === speedIdx ? "bg-brand text-brand-foreground" : "hover:bg-accent"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Detail strip: slides in only when a node is focused (hovered) */}
      <div className="mt-4 mx-auto max-w-3xl min-h-[92px]">
        <AnimatePresence mode="wait">
          {hovered && (
            <motion.div
              key={hovered}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
              className="rounded-xl border border-border bg-card/80 backdrop-blur px-5 py-4 flex items-start gap-4 shadow-lg shadow-brand/5"
            >
              <AgentAvatar kind={hovered} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{t(`agents.${hovered}.title`)}</span>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground border border-border rounded-full px-2 py-0.5">
                    {t(`agents.${hovered}.blurb`)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                  {t(`agents.${hovered}.does`)}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ConstellationNode({
  kind, x, y, size, active, focused, dim, hiddenSm, label, onHover, reduceMotion,
}: {
  kind: AgentKind;
  x: number; y: number;
  size: "md" | "lg";
  active: boolean;
  focused: boolean;
  dim: boolean;
  hiddenSm: boolean;
  label: string;
  onHover: (v: boolean) => void;
  reduceMotion: boolean;
}) {
  const left = `${(x / 1120) * 100}%`;
  const top = `${(y / 680) * 100}%`;

  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 group",
        hiddenSm && "hidden sm:block"
      )}
      style={{ left, top }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      tabIndex={0}
      role="button"
      aria-label={label}
    >
      <motion.div
        animate={
          reduceMotion
            ? {}
            : active
            ? { scale: [1, 1.08, 1] }
            : { scale: 1 }
        }
        transition={{ duration: 2.4, repeat: active ? Infinity : 0, ease: "easeInOut" }}
        className={cn(
          "relative flex flex-col items-center transition-all duration-300",
          dim ? "opacity-35" : "opacity-100",
          focused ? "-translate-y-0.5" : ""
        )}
      >
        {(active || focused) && (
          <span className="absolute inset-0 -m-3 rounded-full bg-brand/20 blur-xl" aria-hidden />
        )}
        <div className="relative">
          <AgentAvatar kind={kind} size={size} pulse={active} />
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background transition-colors",
              active ? "bg-ok" : focused ? "bg-brand" : "bg-muted-foreground/40"
            )}
          />
        </div>
        <div className="mt-2 text-center pointer-events-none">
          <div className={cn(
            "text-[11px] font-medium leading-tight max-w-[140px] transition-colors whitespace-nowrap",
            focused ? "text-foreground" : "text-foreground/60"
          )}>
            {label}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
