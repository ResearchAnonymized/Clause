import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  MAPPING_STATUS_META,
  type EnrichedMappingRow,
  type MappingStatus,
} from "@/lib/clause-mapping-status";
import {
  formatSimilarityPct,
  similarityBand,
  type PairSimilarity,
} from "@/lib/semantic-similarity";

const STATUS_STROKE: Record<MappingStatus, string> = {
  comply: "#16a34a",
  partial: "#d97706",
  deviates: "#dc2626",
  bidder_silent: "#b91c1c",
  tender_silent: "#0284c7",
  needs_review: "#64748b",
};

type Props = {
  rows: EnrichedMappingRow[];
  similarities: Map<string, PairSimilarity>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
};

/**
 * Bipartite tender ↔ bidder relationship map.
 * Edge color = compliance status; edge thickness / label = semantic similarity.
 */
export function MappingSimilarityMap({
  rows,
  similarities,
  selectedId,
  onSelect,
  loading,
}: Props) {
  const layout = useMemo(() => {
    const h = Math.max(320, rows.length * 64 + 80);
    const w = 920;
    const leftX = 160;
    const rightX = 760;
    const top = 48;
    const usable = h - top - 40;
    const step = rows.length > 1 ? usable / (rows.length - 1) : 0;

    const nodes = rows.map((r, i) => {
      const id = r.pair.id ?? r.pair.topic;
      const y = rows.length === 1 ? top + usable / 2 : top + i * step;
      const sim = similarities.get(id);
      return {
        id,
        row: r,
        y,
        left: Boolean(r.pair.customer_excerpt?.trim()),
        right: Boolean(r.pair.supplier_excerpt?.trim()),
        sim,
      };
    });

    return { w, h, leftX, rightX, nodes };
  }, [rows, similarities]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
        Comparing tender and bidder quotes…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border bg-card py-16 text-center text-sm text-muted-foreground">
        No requirements to map for the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">Tender ↔ bidder map</span>
        {" — "}
        Left = tender requirement, right = bidder response. Line colour = compliance status.
        Label = how closely the quotes match.
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <svg
          viewBox={`0 0 ${layout.w} ${layout.h}`}
          className="w-full min-w-[640px] h-auto"
          role="img"
          aria-label="Tender to bidder requirement mapping"
        >
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" className="text-muted-foreground" />
            </marker>
          </defs>

          <text x={layout.leftX} y={24} textAnchor="middle" className="fill-sky-700" fontSize="12" fontWeight="600">
            Tender
          </text>
          <text x={layout.rightX} y={24} textAnchor="middle" className="fill-amber-800" fontSize="12" fontWeight="600">
            Bidder
          </text>

          {layout.nodes.map((n) => {
            const stroke = STATUS_STROKE[n.row.status];
            const sim = n.sim?.similarity ?? null;
            const band = similarityBand(sim);
            const width =
              band === "strong" ? 3.5 : band === "moderate" ? 2.5 : band === "weak" ? 1.5 : 1.25;
            const opacity = selectedId && selectedId !== n.id ? 0.28 : 0.95;
            const midX = (layout.leftX + layout.rightX) / 2;
            const selected = selectedId === n.id;

            const leftY = n.y;
            const rightY = n.y;
            const path = n.left && n.right
              ? `M ${layout.leftX + 70} ${leftY} C ${midX - 40} ${leftY}, ${midX + 40} ${rightY}, ${layout.rightX - 70} ${rightY}`
              : n.left
                ? `M ${layout.leftX + 70} ${leftY} L ${midX} ${leftY}`
                : `M ${midX} ${rightY} L ${layout.rightX - 70} ${rightY}`;

            return (
              <g
                key={n.id}
                opacity={opacity}
                className="cursor-pointer"
                onClick={() => onSelect(n.id)}
              >
                {/* Edge */}
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={selected ? width + 1.5 : width}
                  strokeDasharray={n.left && n.right ? undefined : "5 4"}
                  strokeLinecap="round"
                />

                {/* Similarity badge on edge */}
                {n.left && n.right && (
                  <g transform={`translate(${midX}, ${n.y - 14})`}>
                    <rect
                      x={-28}
                      y={-10}
                      width={56}
                      height={18}
                      rx={9}
                      className={cn(
                        selected ? "fill-foreground" : "fill-background",
                      )}
                      stroke={stroke}
                      strokeWidth={1}
                    />
                    <text
                      textAnchor="middle"
                      y={3}
                      fontSize="10"
                      fontWeight="600"
                      className={selected ? "fill-background" : "fill-foreground"}
                    >
                      {formatSimilarityPct(sim)}
                    </text>
                  </g>
                )}

                {/* Left node */}
                {n.left ? (
                  <NodePill
                    x={layout.leftX}
                    y={n.y}
                    label={n.row.pair.topic}
                    tone="tender"
                    selected={selected}
                    status={n.row.status}
                  />
                ) : (
                  <SilentMark x={layout.leftX} y={n.y} label="Tender silent" />
                )}

                {/* Right node */}
                {n.right ? (
                  <NodePill
                    x={layout.rightX}
                    y={n.y}
                    label={n.row.pair.topic}
                    tone="bidder"
                    selected={selected}
                    status={n.row.status}
                  />
                ) : (
                  <SilentMark x={layout.rightX} y={n.y} label="Bidder silent" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground px-1">
        {(Object.keys(MAPPING_STATUS_META) as MappingStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_STROKE[s] }} />
            {MAPPING_STATUS_META[s].short}
          </span>
        ))}
        <span className="ml-auto">
          Match % · dashed line = one side silent
        </span>
      </div>
    </div>
  );
}

function NodePill({
  x,
  y,
  label,
  tone,
  selected,
  status,
}: {
  x: number;
  y: number;
  label: string;
  tone: "tender" | "bidder";
  selected: boolean;
  status: MappingStatus;
}) {
  const w = 140;
  const h = 36;
  const fill = tone === "tender" ? "rgba(14, 165, 233, 0.12)" : "rgba(245, 158, 11, 0.14)";
  const stroke = selected ? STATUS_STROKE[status] : tone === "tender" ? "#0284c7" : "#d97706";
  const short = label.length > 22 ? `${label.slice(0, 21)}…` : label;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect width={w} height={h} rx={10} fill={fill} stroke={stroke} strokeWidth={selected ? 2.25 : 1.25} />
      <text
        x={w / 2}
        y={h / 2 + 4}
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        className="fill-foreground"
      >
        {short}
      </text>
    </g>
  );
}

function SilentMark({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r={10} className="fill-muted stroke-border" strokeWidth={1} />
      <text textAnchor="middle" y={24} fontSize="9" className="fill-muted-foreground">
        {label}
      </text>
    </g>
  );
}
