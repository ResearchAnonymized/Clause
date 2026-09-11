import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/use-onboarding";
import { loadSamplePacks } from "@/lib/sample-packs";
import { toast } from "sonner";

export type NewRunCoachPhase = "tender" | "bidder" | "start" | null;

export function NewRunCoach({
  phase,
  onLoadSamples,
}: {
  phase: NewRunCoachPhase;
  onLoadSamples: (packs: { tender: File[]; bidder: File[] }) => void;
}) {
  const { t } = useTranslation();
  const { showCoach, dismiss } = useOnboarding();
  const [loadingSamples, setLoadingSamples] = useState(false);

  if (!showCoach || !phase) return null;

  const load = async () => {
    setLoadingSamples(true);
    try {
      const packs = await loadSamplePacks();
      onLoadSamples(packs);
      toast.success(t("onboarding.samplesLoaded"));
    } catch (err: any) {
      toast.error(String(err?.message ?? err));
    } finally {
      setLoadingSamples(false);
    }
  };

  return (
    <div className="rounded-xl border border-brand/25 bg-brand-soft/40 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand text-brand-foreground grid place-items-center shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-brand">
            {t("onboarding.coachKicker")}
          </div>
          <p className="text-sm font-medium mt-0.5">{t(`onboarding.coach.${phase}.title`)}</p>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {t(`onboarding.coach.${phase}.body`)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void load()} disabled={loadingSamples}>
              <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
              {loadingSamples ? t("onboarding.loadingSamples") : t("onboarding.loadSamples")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void dismiss()}>
              {t("onboarding.skipCoach")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
