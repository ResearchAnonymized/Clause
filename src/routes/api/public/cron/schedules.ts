import { createFileRoute } from "@tanstack/react-router";

/**
 * Public cron endpoint. Called by any external scheduler
 * (GitHub Actions, system cron, uptimerobot) to advance any
 * `analysis_schedules` rows whose `next_run_at` has passed.
 *
 * Auth: shared-secret header `x-cron-secret` matching env `CRON_SECRET`.
 * Method: POST (empty body).
 *
 * The endpoint does not upload new documents — instead it re-uses the most
 * recent completed run for the same criteria set as a template, then queues
 * a new run against the Python worker (or falls back to the mock analyzer).
 */
export const Route = createFileRoute("/api/public/cron/schedules")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret") ?? "";
        const expected = process.env.CRON_SECRET ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const nowIso = new Date().toISOString();
        const { data: due, error } = await supabaseAdmin
          .from("analysis_schedules")
          .select("id, workspace_id, criteria_set_id, name, cadence")
          .eq("enabled", true)
          .lte("next_run_at", nowIso);
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ scheduleId: string; runId?: string; note?: string }> = [];

        for (const s of due ?? []) {
          // Find a template run to copy documents from
          const { data: template } = await supabaseAdmin
            .from("runs")
            .select("id, title")
            .eq("workspace_id", s.workspace_id)
            .eq("criteria_set_id", s.criteria_set_id)
            .eq("status", "completed")
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!template) {
            results.push({ scheduleId: s.id, note: "no template run — skipped" });
            await advanceSchedule(supabaseAdmin, s);
            continue;
          }

          const { data: newRun, error: runErr } = await supabaseAdmin
            .from("runs")
            .insert({
              workspace_id: s.workspace_id,
              criteria_set_id: s.criteria_set_id,
              title: `${s.name} · ${new Date().toISOString().slice(0, 10)}`,
              status: "queued",
            })
            .select("id")
            .single();
          if (runErr || !newRun) {
            results.push({ scheduleId: s.id, note: runErr?.message });
            continue;
          }

          const { data: docs } = await supabaseAdmin
            .from("run_documents")
            .select("role, filename, storage_path, mime_type, size_bytes")
            .eq("run_id", template.id);
          if (docs?.length) {
            await supabaseAdmin.from("run_documents").insert(
              docs.map((d) => ({ ...d, run_id: newRun.id, workspace_id: s.workspace_id })),
            );
          }

          results.push({ scheduleId: s.id, runId: newRun.id });
          await advanceSchedule(supabaseAdmin, s);
        }

        return new Response(JSON.stringify({ processed: results.length, results }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});

function nextRunFor(cadence: string) {
  const d = new Date();
  if (cadence === "daily") d.setDate(d.getDate() + 1);
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

async function advanceSchedule(admin: any, s: { id: string; cadence: string }) {
  await admin
    .from("analysis_schedules")
    .update({ last_run_at: new Date().toISOString(), next_run_at: nextRunFor(s.cadence) })
    .eq("id", s.id);
}
