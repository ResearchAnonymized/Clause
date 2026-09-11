import { describe, expect, it } from "vitest";
import {
  allOnboardingComplete,
  emptyOnboarding,
  mergeOnboarding,
  shouldShowChecklist,
  shouldShowNewRunCoach,
} from "@/lib/onboarding";

describe("onboarding progress", () => {
  it("treats a signed-in user as having the account step", () => {
    const s = mergeOnboarding({});
    expect(s.steps.account).toBe(true);
    expect(s.dismissed).toBe(false);
    expect(shouldShowChecklist(s)).toBe(true);
    expect(shouldShowNewRunCoach(s)).toBe(true);
  });

  it("derives first analysis from an existing run", () => {
    const s = mergeOnboarding({}, { hasRun: true });
    expect(s.steps.first_analysis).toBe(true);
    expect(shouldShowNewRunCoach(s)).toBe(false);
  });

  it("hides the checklist once dismissed", () => {
    const s = mergeOnboarding({ dismissed: true, steps: { first_analysis: true } });
    expect(shouldShowChecklist(s)).toBe(false);
  });

  it("marks complete when all steps are done", () => {
    const s = mergeOnboarding({
      steps: {
        first_analysis: true,
        opened_mapping: true,
        opened_report: true,
      },
    });
    expect(allOnboardingComplete(s)).toBe(true);
    expect(s.completed_at).toBeTruthy();
  });

  it("keeps empty defaults stable", () => {
    expect(emptyOnboarding().steps.opened_mapping).toBe(false);
  });
});
