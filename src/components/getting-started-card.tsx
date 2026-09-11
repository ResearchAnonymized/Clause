import { Check, Circle, ListChecks, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_STEPS, type OnboardingStepId } from "@/lib/onboarding";
import { ProductTourStartButton } from "@/components/product-tour";
import type { ReactNode } from "react";

function StepLink({
  id,
  latestRunId,
  className,
  children,
}: {
  id: OnboardingStepId;
  latestRunId: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (id === "first_analysis") {
    return (
      <Link to="/runs/new" className={className}>
        {children}
      </Link>
    );
  }
  if (id === "opened_mapping" && latestRunId) {
    return (
      <Link to="/runs/$runId/mapping" params={{ runId: latestRunId }} className={className}>
        {children}
      </Link>
    );
  }
  if (id === "opened_report" && latestRunId) {
    return (
      <Link to="/runs/$runId/report" params={{ runId: latestRunId }} className={className}>
        {children}
      </Link>
    );
  }
  if (id === "opened_mapping" || id === "opened_report") {
    return (
      <Link to="/runs/new" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/dashboard" className={className}>
      {children}
    </Link>
  );
}

export function GettingStartedCard({ variant = "full" }: { variant?: "full" | "banner" }) {
  const { t } = useTranslation();
  const { state, showChecklist, allDone, dismiss, isLoading } = useOnboarding();

  if (isLoading || !showChecklist || !state) return null;

  const doneCount = ONBOARDING_STEPS.filter((id) => state.steps[id]).length;

  if (variant === "banner" || allDone) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3" data-tour-stage="dashboard">
        <div className="flex items-center gap-3 min-w-0">
          <span className="h-8 w-8 rounded-lg bg-ok/10 text-ok grid place-items-center shrink-0">
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium">{t("onboarding.checklistDoneTitle")}</div>
            <p className="text-xs text-muted-foreground truncate">{t("onboarding.checklistDoneCopy")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ProductTourStartButton variant="outline" size="sm" />
          <Button variant="ghost" size="sm" onClick={() => void dismiss()}>
            {t("onboarding.dismiss")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tour-stage="dashboard"
      className="rounded-xl border bg-card p-6 sm:p-7"
    >
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-lg bg-brand text-brand-foreground grid place-items-center shrink-0">
          {allDone ? <Check className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                {t("onboarding.progress", { done: doneCount, total: ONBOARDING_STEPS.length })}
              </div>
              <div className="font-semibold text-lg mt-1 flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-brand" />
                {allDone ? t("onboarding.checklistDoneTitle") : t("onboarding.checklistTitle")}
              </div>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-2xl">
                {allDone ? t("onboarding.checklistDoneCopy") : t("onboarding.checklistCopy")}
              </p>
            </div>
          </div>

          <ol className="mt-5 space-y-2">
            {ONBOARDING_STEPS.map((id, index) => {
              const done = state.steps[id];
              const locked = (id === "opened_mapping" || id === "opened_report") && !state.latestRunId && !done;
              return (
                <li key={id}>
                  {locked ? (
                    <div className="flex items-start gap-3 rounded-lg border bg-background/70 px-3 py-2.5 text-sm opacity-70">
                      <StepIcon done={false} />
                      <div>
                        <div className="font-medium">
                          {index + 1}. {t(`onboarding.steps.${id}.title`)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(`onboarding.steps.${id}.body`)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <StepLink
                      id={id}
                      latestRunId={state.latestRunId}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                        done
                          ? "bg-background/70 border-ok/30 hover:bg-background"
                          : "bg-background hover:border-brand/40 hover:bg-brand-soft/30",
                      )}
                    >
                      <StepIcon done={done} />
                      <div className="min-w-0">
                        <div className="font-medium">
                          {index + 1}. {t(`onboarding.steps.${id}.title`)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(`onboarding.steps.${id}.body`)}
                        </p>
                      </div>
                    </StepLink>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex flex-wrap gap-2">
            {!state.steps.first_analysis && (
              <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90">
                <Link to="/runs/new">{t("onboarding.startFirst")}</Link>
              </Button>
            )}
            <ProductTourStartButton variant="outline" size="sm" />
            <Button variant="ghost" size="sm" onClick={() => void dismiss()}>
              {t("onboarding.dismiss")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIcon({ done }: { done: boolean }) {
  return done ? (
    <span className="mt-0.5 h-5 w-5 rounded-full bg-ok text-white grid place-items-center shrink-0">
      <Check className="h-3 w-3" />
    </span>
  ) : (
    <span className="mt-0.5 h-5 w-5 rounded-full border border-muted-foreground/40 grid place-items-center shrink-0">
      <Circle className="h-2.5 w-2.5 text-muted-foreground" />
    </span>
  );
}
