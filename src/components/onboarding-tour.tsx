import { resetOnboardingProgress } from "@/lib/onboarding.functions";

/** Replay getting-started from Settings / Help. */
export async function resetOnboarding() {
  try {
    await resetOnboardingProgress();
  } catch {
    /* still reload so the checklist can pick up a fresh query */
  }
  try {
    window.localStorage.removeItem("clause.onboarding.v1");
  } catch {
    /* ignore */
  }
  window.location.assign("/dashboard");
}
