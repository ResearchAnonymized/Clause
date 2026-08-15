import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/runs/compare")({
  head: () => ({ meta: [{ title: "Compare analyses — Clause" }] }),
  component: ComparePage,
});

type Finding = {
  id: string;
  criterion_name: string;
  category: string;
  severity: string;
  justification: string | null;
  clause_ref: string | null;
  prompt_variant: number | null;
};

function severityColor(s: string) {
  if (s === "critical") return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (s === "warning") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
}

function useRunFindings(runId: string | null) {
  return useQuery({
    queryKey: ["compare-findings", runId],
    enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("findings")
        .select("id, criterion_name, category, severity, justification, clause_ref, prompt_variant")
        .eq("run_id", runId!)
        .is("superseded_at", null)
        .order("category");
      if (error) throw error;
      return (data ?? []) as Finding[];
    },
  });
}

function ComparePage() {
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const { data: runs } = useQuery({
    queryKey: ["compare-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("runs")
        .select("id, title, status, created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: left } = useRunFindings(leftId);
  const { data: right } = useRunFindings(rightId);

  const rows = useMemo(() => {
    const map = new Map<string, { criterion: string; left?: Finding; right?: Finding }>();
    (left ?? []).forEach((f) => {
      map.set(f.criterion_name, { criterion: f.criterion_name, left: f });
    });
    (right ?? []).forEach((f) => {
      const existing = map.get(f.criterion_name);
      if (existing) existing.right = f;
      else map.set(f.criterion_name, { criterion: f.criterion_name, right: f });
    });
    return Array.from(map.values()).sort((a, b) => a.criterion.localeCompare(b.criterion));
  }, [left, right]);

  const diffs = rows.filter(
    (r) => r.left && r.right && r.left.severity !== r.right.severity,
  ).length;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <PageBack label="Back to analyses" fallback={{ to: "/runs" }} />
        <PageBreadcrumbs items={[{ label: "Analyses", to: "/runs" }, { label: "Compare" }]} />
      </div>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <GitCompare className="w-6 h-6" /> Compare analyses
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Diff two completed runs side by side — useful for prompt A/B tests or supplier revisions.
          For the same tender across several bidders, use{" "}
          <Link to="/runs/bidders" className="text-brand underline-offset-2 hover:underline">
            Multi-bidder matrix
          </Link>
          .
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {(["A", "B"] as const).map((side) => (
          <Card key={side}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Analysis {side}</CardTitle>
              <CardDescription>Pick a completed run</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={(side === "A" ? leftId : rightId) ?? ""}
                onValueChange={(v) => (side === "A" ? setLeftId(v) : setRightId(v))}
              >
                <SelectTrigger><SelectValue placeholder="Select analysis…" /></SelectTrigger>
                <SelectContent>
                  {(runs ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        ))}
      </div>

      {leftId && rightId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Side-by-side findings</span>
              <Badge variant="secondary">{diffs} differences</Badge>
            </CardTitle>
            <CardDescription>Rows highlighted amber changed severity between runs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r) => {
              const changed = r.left && r.right && r.left.severity !== r.right.severity;
              return (
                <div
                  key={r.criterion}
                  className={`grid grid-cols-[1fr_1fr_1fr] gap-3 items-start p-3 rounded border ${
                    changed ? "border-amber-400/60 bg-amber-50/50 dark:bg-amber-900/10" : ""
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{r.criterion}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.left?.category ?? r.right?.category}
                    </div>
                  </div>
                  <FindingCell f={r.left} />
                  <FindingCell f={r.right} />
                </div>
              );
            })}
            {rows.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No findings to compare yet.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FindingCell({ f }: { f?: Finding }) {
  if (!f) {
    return <div className="text-xs text-muted-foreground italic">— not present —</div>;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className={severityColor(f.severity)}>
          {f.severity}
        </Badge>
        {f.clause_ref && (
          <span className="text-[10px] text-muted-foreground">{f.clause_ref}</span>
        )}
        {typeof f.prompt_variant === "number" && (
          <span className="text-[10px] text-muted-foreground">variant {f.prompt_variant}</span>
        )}
      </div>
      {f.justification && (
        <p className="text-xs text-muted-foreground line-clamp-3">{f.justification}</p>
      )}
    </div>
  );
}
