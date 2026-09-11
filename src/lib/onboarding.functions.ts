import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getSql } from "@/db/pool";
import {
  emptyOnboarding,
  mergeOnboarding,
  type OnboardingState,
  type OnboardingStepId,
} from "@/lib/onboarding";

export type OnboardingPayload = OnboardingState & {
  latestRunId: string | null;
};

async function loadState(userId: string): Promise<OnboardingPayload> {
  const sql = getSql();
  const [profileRows, runRows] = await Promise.all([
    sql`SELECT onboarding_json FROM profiles WHERE id = ${userId} LIMIT 1`,
    sql`
      SELECT r.id
      FROM runs r
      JOIN profiles p ON p.current_workspace_id = r.workspace_id
      WHERE p.id = ${userId}
      ORDER BY r.created_at DESC
      LIMIT 1
    `,
  ]);
  const latestRunId = (runRows[0]?.id as string | undefined) ?? null;
  const merged = mergeOnboarding(profileRows[0]?.onboarding_json, { hasRun: !!latestRunId });
  return { ...merged, latestRunId };
}

async function saveState(userId: string, next: OnboardingState): Promise<OnboardingPayload> {
  const sql = getSql();
  await sql`
    UPDATE profiles
    SET onboarding_json = ${sql.json(next)}, updated_at = now()
    WHERE id = ${userId}
  `;
  return loadState(userId);
}

export const getOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    return loadState(userId);
  });

const StepInput = z.object({
  step: z.enum(["account", "first_analysis", "opened_mapping", "opened_report"]),
});

export const markOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StepInput.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const current = await loadState(userId);
    const step = data.step as OnboardingStepId;
    const next = mergeOnboarding(
      {
        ...current,
        steps: { ...current.steps, [step]: true, account: true },
      },
      { hasRun: !!current.latestRunId || step === "first_analysis" },
    );
    return saveState(userId, next);
  });

export const dismissOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const current = await loadState(userId);
    return saveState(userId, { ...current, dismissed: true });
  });

export const resetOnboardingProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const current = await loadState(userId);
    // Replay: show the checklist again. Keep completed work ticks so the path stays honest.
    return saveState(userId, {
      ...emptyOnboarding(),
      steps: { ...current.steps, account: true },
      dismissed: false,
      completed_at: current.completed_at,
    });
  });
