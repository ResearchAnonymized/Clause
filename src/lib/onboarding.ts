export const ONBOARDING_STEPS = [
  "account",
  "first_analysis",
  "opened_mapping",
  "opened_report",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export type OnboardingState = {
  dismissed: boolean;
  completed_at: string | null;
  steps: Record<OnboardingStepId, boolean>;
};

export function emptyOnboarding(): OnboardingState {
  return {
    dismissed: false,
    completed_at: null,
    steps: {
      account: true,
      first_analysis: false,
      opened_mapping: false,
      opened_report: false,
    },
  };
}

export function mergeOnboarding(raw: unknown, derived?: { hasRun?: boolean }): OnboardingState {
  const base = emptyOnboarding();
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const stepsIn = (obj.steps && typeof obj.steps === "object" ? obj.steps : {}) as Record<string, unknown>;
  const steps = { ...base.steps };
  for (const id of ONBOARDING_STEPS) {
    if (id === "account") {
      steps.account = true;
      continue;
    }
    if (stepsIn[id] === true) steps[id] = true;
  }
  if (derived?.hasRun) steps.first_analysis = true;
  const allDone = ONBOARDING_STEPS.every((id) => steps[id]);
  const completed_at =
    typeof obj.completed_at === "string"
      ? obj.completed_at
      : allDone
        ? new Date().toISOString()
        : null;
  return {
    dismissed: obj.dismissed === true,
    completed_at,
    steps,
  };
}

export function allOnboardingComplete(state: OnboardingState): boolean {
  return ONBOARDING_STEPS.every((id) => state.steps[id]);
}

export function shouldShowChecklist(state: OnboardingState): boolean {
  return !state.dismissed;
}

export function shouldShowNewRunCoach(state: OnboardingState): boolean {
  return !state.dismissed && !state.steps.first_analysis;
}
