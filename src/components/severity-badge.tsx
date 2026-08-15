import { AlertOctagon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const map = {
    critical: { label: "Critical", icon: AlertOctagon, style: "bg-critical/10 text-critical border-critical/30" },
    warning: { label: "Warning", icon: AlertTriangle, style: "bg-warning/10 text-warning border-warning/30" },
    ok: { label: "OK", icon: CheckCircle2, style: "bg-ok/10 text-ok border-ok/30" },
  } as const;
  const key = (severity as keyof typeof map) in map ? (severity as keyof typeof map) : "ok";
  const { label, icon: Icon, style } = map[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        style,
        className,
      )}
    >
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}
