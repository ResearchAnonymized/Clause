import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import { toVerdict, verdictTone, verdictI18nKey, type Severity } from "@/lib/verdict";

export function VerdictBadge({ severity, size = "md" }: { severity: Severity; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const v = toVerdict(severity);
  const tone = verdictTone[v];
  const Icon = v === "aligned" ? CheckCircle2 : v === "partial" ? AlertTriangle : v === "gap" ? XCircle : MinusCircle;
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  const ic = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${pad} ${tone.text} ${tone.bg} ${tone.border}`}>
      <Icon className={ic} />
      {t(verdictI18nKey[v])}
    </span>
  );
}
