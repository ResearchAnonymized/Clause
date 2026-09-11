import type { TFunction } from "i18next";
import type { Verdict } from "@/lib/verdict";

export function CoverageBar({
  counts,
  total,
  t,
}: {
  counts: Record<Verdict, number>;
  total: number;
  t: TFunction;
}) {
  const parts: { verdict: Verdict; n: number; className: string }[] = [
    { verdict: "gap", n: counts.gap, className: "bg-critical" },
    { verdict: "partial", n: counts.partial, className: "bg-warning" },
    { verdict: "aligned", n: counts.aligned, className: "bg-ok" },
    { verdict: "not_addressed", n: counts.not_addressed, className: "bg-muted-foreground/40" },
  ];
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {parts.map((p) =>
          p.n > 0 ? (
            <div
              key={p.verdict}
              className={p.className}
              style={{ width: `${Math.max(total > 0 ? (p.n / total) * 100 : 0, 0)}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {parts
          .filter((p) => p.n > 0 || p.verdict !== "not_addressed")
          .map((p) => (
            <span key={p.verdict} className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${p.className}`} />
              {t(`verdict.${p.verdict === "not_addressed" ? "notAddressed" : p.verdict}`)}
              <span className="font-medium tabular-nums text-foreground">{p.n}</span>
            </span>
          ))}
      </div>
    </div>
  );
}
