import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookMarked,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  LayoutDashboard,
  Map,
  Plus,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_TOUR_STEPS, type ProductTourStepId } from "@/lib/product-tour";
import { cn } from "@/lib/utils";

type Hole = { x: number; y: number; w: number; h: number };
type Placement = "right" | "left" | "bottom" | "top";

type ProductTourContextValue = {
  active: boolean;
  stepIndex: number;
  start: (fromIndex?: number) => void;
  go: (index: number) => void;
  next: () => void;
  back: () => void;
  stop: () => void;
};

const ProductTourContext = createContext<ProductTourContextValue | null>(null);

const STEP_ICONS: Record<ProductTourStepId, LucideIcon> = {
  dashboard: LayoutDashboard,
  newAnalysis: Plus,
  analyses: FileSearch,
  criteria: BookMarked,
  agents: Bot,
  settings: Settings,
  help: BookOpen,
};

export function useProductTour() {
  const ctx = useContext(ProductTourContext);
  if (!ctx) {
    throw new Error("useProductTour must be used inside ProductTourProvider");
  }
  return ctx;
}

export function useProductTourOptional() {
  return useContext(ProductTourContext);
}

export function ProductTourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const go = useCallback(
    (index: number) => {
      const step = PRODUCT_TOUR_STEPS[index];
      if (!step) return;
      setStepIndex(index);
      void navigate({ to: step.path });
    },
    [navigate],
  );

  const start = useCallback(
    (fromIndex = 0) => {
      setActive(true);
      go(fromIndex);
    },
    [go],
  );

  const stop = useCallback(() => {
    setActive(false);
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= PRODUCT_TOUR_STEPS.length - 1) {
      setActive(false);
      return;
    }
    go(stepIndex + 1);
  }, [go, stepIndex]);

  const back = useCallback(() => {
    if (stepIndex <= 0) return;
    go(stepIndex - 1);
  }, [go, stepIndex]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stop();
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, back, next, stop]);

  const value = useMemo(
    () => ({ active, stepIndex, start, go, next, back, stop }),
    [active, stepIndex, start, go, next, back, stop],
  );

  return (
    <ProductTourContext.Provider value={value}>
      {children}
      <ProductTourLayer />
    </ProductTourContext.Provider>
  );
}

function ProductTourLayer() {
  const { active, stepIndex, next, back, stop, go } = useProductTour();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const step = PRODUCT_TOUR_STEPS[stepIndex];
  const [hole, setHole] = useState<Hole | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!active || !step) {
      setHole(null);
      return;
    }
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      const el = findTourTarget(step.id);
      if (!el) {
        setHole(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) {
        setHole(null);
        return;
      }
      const pad = 10;
      const nextHole = {
        x: Math.max(8, r.left - pad),
        y: Math.max(8, r.top - pad),
        w: Math.min(window.innerWidth - 16, r.width + pad * 2),
        h: Math.min(window.innerHeight - 16, r.height + pad * 2),
      };
      const tooLarge =
        nextHole.w > window.innerWidth * 0.72 || nextHole.h > window.innerHeight * 0.42;
      setHole(tooLarge ? null : nextHole);
    };
    measure();
    const a = window.requestAnimationFrame(measure);
    const t1 = window.setTimeout(measure, 80);
    const t2 = window.setTimeout(measure, 280);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(a);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step, pathname]);

  if (!active || !step) return null;

  return (
    <div className="contents">
      <TourSpotlight hole={hole} viewport={viewport} />
      <ProductTourCard
        hole={hole}
        stepIndex={stepIndex}
        next={next}
        back={back}
        stop={stop}
        go={go}
      />
    </div>
  );
}

function TourSpotlight({
  hole,
  viewport,
}: {
  hole: Hole | null;
  viewport: { w: number; h: number };
}) {
  const rawId = useId();
  const maskId = `tour-mask-${rawId.replace(/:/g, "")}`;
  const w = viewport.w || (typeof window !== "undefined" ? window.innerWidth : 0);
  const h = viewport.h || (typeof window !== "undefined" ? window.innerHeight : 0);

  return (
    <>
      <svg
        className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
        width={w}
        height={h}
        aria-hidden
      >
        <defs>
          <mask id={maskId}>
            <rect width={w} height={h} fill="white" />
            {hole && (
              <rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx="14" fill="black" />
            )}
          </mask>
        </defs>
        <rect width={w} height={h} fill="rgba(8, 16, 48, 0.58)" mask={`url(#${maskId})`} />
      </svg>
      {hole && (
        <div
          className="tour-spotlight-ring pointer-events-none fixed z-[61] rounded-[14px]"
          style={{ top: hole.y, left: hole.x, width: hole.w, height: hole.h }}
        />
      )}
    </>
  );
}

function ProductTourCard({
  hole,
  stepIndex,
  next,
  back,
  stop,
  go,
}: {
  hole: Hole | null;
  stepIndex: number;
  next: () => void;
  back: () => void;
  stop: () => void;
  go: (index: number) => void;
}) {
  const { t } = useTranslation();
  const step = PRODUCT_TOUR_STEPS[stepIndex];
  const total = PRODUCT_TOUR_STEPS.length;
  const isLast = stepIndex === total - 1;
  const Icon = STEP_ICONS[step.id];
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 400, h: 280 });

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - cardSize.w) > 1 || Math.abs(r.height - cardSize.h) > 1) {
      setCardSize({ w: r.width, h: r.height });
    }
  }, [stepIndex, hole, cardSize.h, cardSize.w]);

  const pos = placeCard(hole, cardSize.w, cardSize.h);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step.id}
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="product-tour-title"
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 6, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto fixed z-[70] w-[min(26rem,calc(100vw-1.75rem))] max-h-[calc(100vh-1.5rem)] overflow-y-auto"
        style={{ left: pos.left, top: pos.top }}
      >
        {pos.placement !== "center" && (
          <span
            aria-hidden
            className={cn(
              "absolute h-3.5 w-3.5 rotate-45 bg-brand",
              pos.placement === "right" && "left-0 top-10 -translate-x-1/2",
              pos.placement === "left" && "right-0 top-10 translate-x-1/2",
              pos.placement === "bottom" && "left-10 top-0 -translate-y-1/2",
              pos.placement === "top" && "left-10 bottom-0 translate-y-1/2",
            )}
          />
        )}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card shadow-[0_24px_80px_-12px_rgba(10,36,114,0.45)]">
          <div className="relative bg-gradient-to-br from-brand via-brand to-[color-mix(in_oklch,var(--brand)_72%,black)] px-5 pt-4 pb-4 text-brand-foreground">
            <div className="absolute inset-x-0 top-0 h-0.5 bg-white/15">
              <div
                className="h-full bg-white/85 transition-all duration-300"
                style={{ width: `${((stepIndex + 1) / total) * 100}%` } as CSSProperties}
              />
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">
                  {t("productTour.kicker", { i: stepIndex + 1, total })}
                </div>
                <h2 id="product-tour-title" className="mt-1 font-display text-lg font-semibold tracking-tight">
                  {t(`productTour.steps.${step.id}.title`)}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-white/80 hover:bg-white/10 hover:text-white"
                onClick={stop}
                aria-label={t("productTour.close")}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="px-5 pt-4 pb-2">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(`productTour.steps.${step.id}.body`)}
            </p>
            <div className="mt-4 flex items-center gap-1.5">
              {PRODUCT_TOUR_STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={t(`productTour.steps.${s.id}.title`)}
                  aria-current={i === stepIndex ? "step" : undefined}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === stepIndex
                      ? "w-7 bg-brand"
                      : i < stepIndex
                        ? "w-3.5 bg-brand/45 hover:bg-brand/70"
                        : "w-3.5 bg-muted hover:bg-muted-foreground/30",
                  )}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-5 py-3.5">
            <button
              type="button"
              onClick={stop}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("productTour.skip")}
            </button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={back} disabled={stepIndex === 0}>
                <ChevronLeft className="h-3.5 w-3.5" />
                {t("common.back")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-brand text-brand-foreground hover:bg-brand/90 shadow-sm min-w-[5.5rem]"
                onClick={next}
              >
                {isLast ? t("productTour.finish") : t("common.next")}
                {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="border-t bg-muted/40 px-5 py-2 text-[11px] text-muted-foreground">
            {t("productTour.hint")}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function ProductTourStartButton({
  variant = "ghost",
  size = "sm",
  className,
  label,
}: {
  variant?: "ghost" | "outline" | "secondary" | "default";
  size?: "sm" | "icon" | "default";
  className?: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const tour = useProductTourOptional();
  if (!tour) return null;
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(
        tour.active && size === "icon" && "bg-brand text-brand-foreground hover:bg-brand/90",
        className,
      )}
      onClick={() => tour.start(0)}
      aria-label={label || t("productTour.start")}
      title={label || t("productTour.start")}
      aria-pressed={tour.active}
    >
      <Map className={size === "icon" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {size !== "icon" && (label || t("productTour.start"))}
    </Button>
  );
}

function findTourTarget(id: string): HTMLElement | null {
  const staged = pickLargestVisible(document.querySelectorAll<HTMLElement>(`[data-tour-stage="${id}"]`));
  const nav = pickLargestVisible(document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`));
  const compact = window.innerWidth < 880 || window.innerHeight < 640;

  if (compact && nav) return nav;
  if (staged) {
    const r = staged.getBoundingClientRect();
    if (r.width > window.innerWidth * 0.68 && nav) return nav;
    return staged;
  }
  if (nav) return nav;

  const h1 = document.querySelector<HTMLElement>("main h1");
  if (h1) {
    const parent = h1.parentElement;
    if (parent) {
      const r = parent.getBoundingClientRect();
      if (r.width >= 80 && r.height >= 32 && r.height < window.innerHeight * 0.45) {
        return parent;
      }
    }
    return h1;
  }
  return null;
}

function pickLargestVisible(nodes: NodeListOf<HTMLElement> | HTMLElement[]): HTMLElement | null {
  const list = [...nodes]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(
      ({ r }) =>
        r.width > 8 &&
        r.height > 8 &&
        r.bottom > 8 &&
        r.top < window.innerHeight - 8 &&
        r.right > 8 &&
        r.left < window.innerWidth - 8,
    );
  if (!list.length) return null;
  list.sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height);
  return list[0].el;
}

function placeCard(hole: Hole | null, cardW: number, cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 14;
  const gap = 18;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const bottomSheet = {
    left: clamp((vw - cardW) / 2, margin, vw - cardW - margin),
    top: clamp(vh - cardH - 16, margin, vh - cardH - margin),
    placement: "center" as Placement,
  };

  if (!hole) return bottomSheet;
  if (vh < 560) return bottomSheet;

  const rightSpace = vw - (hole.x + hole.w) - margin;
  const leftSpace = hole.x - margin;
  const belowSpace = vh - (hole.y + hole.h) - margin;
  const aboveSpace = hole.y - margin;

  if (rightSpace >= cardW + gap && hole.x + hole.w < vw * 0.62) {
    return {
      left: hole.x + hole.w + gap,
      top: clamp(hole.y, margin, vh - cardH - margin),
      placement: "right" as Placement,
    };
  }
  if (belowSpace >= cardH + gap) {
    return {
      left: clamp(hole.x, margin, vw - cardW - margin),
      top: hole.y + hole.h + gap,
      placement: "bottom" as Placement,
    };
  }
  if (leftSpace >= cardW + gap) {
    return {
      left: hole.x - cardW - gap,
      top: clamp(hole.y, margin, vh - cardH - margin),
      placement: "left" as Placement,
    };
  }
  if (aboveSpace >= cardH + gap) {
    return {
      left: clamp(hole.x, margin, vw - cardW - margin),
      top: hole.y - cardH - gap,
      placement: "top" as Placement,
    };
  }
  return bottomSheet;
}
