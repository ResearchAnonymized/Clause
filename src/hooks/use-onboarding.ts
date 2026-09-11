import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  dismissOnboarding,
  getOnboarding,
  markOnboardingStep,
  resetOnboardingProgress,
  type OnboardingPayload,
} from "@/lib/onboarding.functions";
import {
  allOnboardingComplete,
  shouldShowChecklist,
  shouldShowNewRunCoach,
  type OnboardingStepId,
} from "@/lib/onboarding";

const KEY = ["onboarding"] as const;

export function useOnboarding() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => getOnboarding(),
    staleTime: 15_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const mark = async (step: OnboardingStepId) => {
    const next = await markOnboardingStep({ data: { step } });
    qc.setQueryData(KEY, next);
    return next;
  };

  const dismiss = async () => {
    const next = await dismissOnboarding();
    qc.setQueryData(KEY, next);
    return next;
  };

  const replay = async () => {
    const next = await resetOnboardingProgress();
    qc.setQueryData(KEY, next);
    return next;
  };

  const state = query.data as OnboardingPayload | undefined;

  return {
    ...query,
    state,
    showChecklist: state ? shouldShowChecklist(state) : false,
    showCoach: state ? shouldShowNewRunCoach(state) : false,
    allDone: state ? allOnboardingComplete(state) : false,
    mark,
    dismiss,
    replay,
    refresh,
  };
}
