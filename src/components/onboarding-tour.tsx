import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Sparkles, FileSearch, BookMarked, Bot, Activity, Check } from "lucide-react";

const STORAGE_KEY = "clause.onboarding.v1";

const ICONS = [Sparkles, FileSearch, BookMarked, Bot, Activity];

export function OnboardingTour() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const rawSteps = t("onboarding.steps", { returnObjects: true, defaultValue: [] });
  const steps: Array<{ title: string; body: string }> = Array.isArray(rawSteps)
    ? (rawSteps as Array<{ title: string; body: string }>)
    : [];
  const total = steps.length || 5;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = window.localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(timer);
    }
  }, []);

  const finish = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {}
    setOpen(false);
  };

  const s = steps[step] ?? { title: "", body: "" };
  const Icon = ICONS[step] ?? Sparkles;
  const isLast = step === total - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finish())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand text-brand-foreground grid place-items-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>{s.title}</DialogTitle>
              <DialogDescription className="text-xs">
                {t("onboarding.stepOf", { i: step + 1, total })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed py-2">{s.body}</p>

        <div className="flex items-center gap-1.5 pt-1">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-8 bg-brand" : i < step ? "w-4 bg-brand/40" : "w-4 bg-muted"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:flex-row flex-col-reverse pt-2">
          <Button variant="ghost" size="sm" onClick={finish}>
            {t("onboarding.skip")}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                {t("common.back")}
              </Button>
            )}
            {!isLast && (
              <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setStep((s) => s + 1)}>
                {t("common.next")}
              </Button>
            )}
            {isLast && (
              <Button asChild size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={finish}>
                <Link to="/runs/new">
                  <Check className="w-4 h-4 mr-1" /> {t("onboarding.startFirst")}
                </Link>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function resetOnboarding() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  } catch {}
}
