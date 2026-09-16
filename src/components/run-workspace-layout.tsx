import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, Columns2, FileStack, Link2, ListChecks } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PageBack } from "@/components/page-back";
import { cn } from "@/lib/utils";

export type RunWorkspacePage = "analysis" | "compare" | "documents" | "mapping" | "report";

type Props = {
  runId: string;
  page: RunWorkspacePage;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  banner?: ReactNode;
  /** Fill the viewport (analysis / compare / documents). Mapping and report scroll. */
  fill?: boolean;
  children: ReactNode;
};

const PAGES: Array<{
  id: RunWorkspacePage;
  labelKey: "viewAnalysis" | "viewCompare" | "mappingShort" | "viewDocuments" | "reportShort";
  icon: LucideIcon;
}> = [
  { id: "analysis", labelKey: "viewAnalysis", icon: ListChecks },
  { id: "compare", labelKey: "viewCompare", icon: Columns2 },
  { id: "mapping", labelKey: "mappingShort", icon: Link2 },
  { id: "documents", labelKey: "viewDocuments", icon: FileStack },
  { id: "report", labelKey: "reportShort", icon: ClipboardList },
];

export function RunWorkspaceLayout({
  runId,
  page,
  title,
  subtitle,
  actions,
  banner,
  fill = false,
  children,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0">
      <nav
        data-testid="run-workspace-nav"
        aria-label={t("review.workspaceNav")}
        className="hidden md:flex w-52 shrink-0 flex-col border-r bg-muted/25"
      >
        <div className="px-3 pt-4 pb-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("review.workspaceNav")}
          </div>
        </div>
        <div className="flex flex-col gap-0.5 px-2">
          {PAGES.map((item) => (
            <RunNavLink
              key={item.id}
              runId={runId}
              page={item.id}
              active={page === item.id}
              icon={item.icon}
              label={t(`review.${item.labelKey}`)}
            />
          ))}
        </div>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="md:hidden border-b bg-background px-2 py-1.5 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max" role="tablist" aria-label={t("review.workspaceNav")}>
            {PAGES.map((item) => (
              <RunNavLink
                key={item.id}
                runId={runId}
                page={item.id}
                active={page === item.id}
                icon={item.icon}
                label={t(`review.${item.labelKey}`)}
                compact
              />
            ))}
          </div>
        </div>

        <div className="border-b bg-background px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <PageBack
                label={t("runDetail.allAnalyses")}
                fallback={{ to: "/runs" }}
                preferFallback
              />
              <div className="hidden sm:block h-5 w-px bg-border" />
              <div className="min-w-0">
                <h1 className="font-sans font-semibold truncate text-[15px] tracking-tight">{title}</h1>
                {subtitle ? (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</div>
                ) : null}
              </div>
            </div>
            {actions ? <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div> : null}
          </div>
        </div>

        {banner}

        <div className={cn("min-h-0 flex-1", fill ? "flex flex-col overflow-hidden" : "overflow-y-auto")}>
          {children}
        </div>
      </div>
    </div>
  );
}

function RunNavLink({
  runId,
  page,
  active,
  icon: Icon,
  label,
  compact = false,
}: {
  runId: string;
  page: RunWorkspacePage;
  active: boolean;
  icon: LucideIcon;
  label: string;
  compact?: boolean;
}) {
  const className = cn(
    "inline-flex items-center transition-colors",
    compact
      ? "gap-1.5 rounded-md px-2.5 py-1.5 text-xs"
      : "w-full gap-2.5 rounded-md px-2.5 py-2 text-sm",
    active
      ? "bg-background text-foreground shadow-sm font-medium"
      : "text-muted-foreground hover:text-foreground hover:bg-background/70",
  );

  const inner = (
    <>
      <Icon className={cn("shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <span>{label}</span>
    </>
  );

  if (page === "mapping") {
    return (
      <Link
        to="/runs/$runId/mapping"
        params={{ runId }}
        className={className}
        aria-current={active ? "page" : undefined}
      >
        {inner}
      </Link>
    );
  }

  if (page === "report") {
    return (
      <Link
        to="/runs/$runId/report"
        params={{ runId }}
        className={className}
        aria-current={active ? "page" : undefined}
      >
        {inner}
      </Link>
    );
  }

  return (
    <Link
      to="/runs/$runId"
      params={{ runId }}
      search={{
        view: page === "analysis" ? undefined : page,
        side: undefined,
        quote: undefined,
      }}
      className={className}
      aria-current={active ? "page" : undefined}
    >
      {inner}
    </Link>
  );
}
