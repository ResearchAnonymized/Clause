import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ runId: z.string().uuid() });

/**
 * Re-extracts parsed_text for run_documents rows that are missing it.
 * Safe to call multiple times; only touches rows where parsed_text is empty.
 */
export const backfillRunParsedText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { extractText, hasUsableExtractedText } = await import("@/lib/analysis-agents.server");

    const { data: docs } = await supabase
      .from("run_documents")
      .select("id, filename, storage_path, parsed_text")
      .eq("run_id", data.runId);

    let updated = 0;
    for (const d of docs ?? []) {
      if (hasUsableExtractedText(d.parsed_text)) continue;
      if (!d.storage_path) continue;
      try {
        const dl = await supabase.storage.from("contracts").download(d.storage_path);
        if (dl.error || !dl.data) continue;
        const buf = await dl.data.arrayBuffer();
        const text = await extractText(buf, d.filename ?? "");
        const { error } = await supabase
          .from("run_documents")
          .update({ parsed_text: hasUsableExtractedText(text) ? text.slice(0, 200_000) : null })
          .eq("id", d.id);
        if (!error) updated++;
      } catch {
        // best-effort
      }
    }
    return { updated };
  });
