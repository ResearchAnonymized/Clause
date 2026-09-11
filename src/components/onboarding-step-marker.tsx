import { useEffect, useRef } from "react";
import type { OnboardingStepId } from "@/lib/onboarding";
import { useOnboarding } from "@/hooks/use-onboarding";

/** Marks a getting-started step when the user actually opens that screen. */
export function OnboardingStepMarker({ step }: { step: OnboardingStepId }) {
  const { mark, state } = useOnboarding();
  const sent = useRef(false);

  useEffect(() => {
    if (!state || sent.current) return;
    if (state.steps[step]) {
      sent.current = true;
      return;
    }
    sent.current = true;
    void mark(step);
  }, [mark, state, step]);

  return null;
}
