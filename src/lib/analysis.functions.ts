import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  runId: z.string().uuid(),
  criteriaSetId: z.string().uuid(),
});

export const runAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { runAnalysisPipeline } = await import("@/lib/analysis-pipeline.server");
    return runAnalysisPipeline(context.supabase as any, data);
  });
