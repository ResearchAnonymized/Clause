/**
 * Professional back navigation:
 * - Prefer in-app browser history when available
 * - Else fall back to a logical parent route
 */
import { ArrowLeft } from "lucide-react";
import { Link, useRouter, type LinkProps } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FallbackLink = {
  to: LinkProps["to"];
  params?: LinkProps["params"];
  search?: LinkProps["search"];
};

type PageBackProps = {
  /** Shown when history cannot go back (or as aria fallback). */
  label: string;
  /** Logical parent when history.back is unavailable. */
  fallback: FallbackLink;
  className?: string;
  size?: "sm" | "default";
  variant?: "ghost" | "outline";
  /** Force parent link instead of history (e.g. explicit “All analyses”). */
  preferFallback?: boolean;
};

function canGoBack(router: ReturnType<typeof useRouter>): boolean {
  try {
    const hist = router.history as { index?: number; length?: number; back: () => void };
    if (typeof hist.index === "number") return hist.index > 0;
  } catch {
    /* ignore */
  }
  // Browser session stack (1 = landed here directly)
  return typeof window !== "undefined" && window.history.length > 1;
}

export function PageBack({
  label,
  fallback,
  className,
  size = "sm",
  variant = "ghost",
  preferFallback = false,
}: PageBackProps) {
  const router = useRouter();
  const useHistory = !preferFallback && canGoBack(router);

  if (!useHistory) {
    return (
      <Button variant={variant} size={size} asChild className={cn("-ml-2", className)}>
        <Link to={fallback.to} params={fallback.params as any} search={fallback.search as any}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          {label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("-ml-2", className)}
      onClick={() => router.history.back()}
    >
      <ArrowLeft className="w-4 h-4 mr-1" />
      {label}
    </Button>
  );
}

type Crumb = { label: string; to?: LinkProps["to"]; params?: LinkProps["params"]; search?: LinkProps["search"] };

/** Compact breadcrumb trail for nested run / settings pages. */
export function PageBreadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("hidden md:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0", className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1.5 min-w-0">
            {i > 0 && <span className="text-border">/</span>}
            {last || !item.to ? (
              <span className={cn("truncate", last && "text-foreground font-medium")}>{item.label}</span>
            ) : (
              <Link
                to={item.to}
                params={item.params as any}
                search={item.search as any}
                className="truncate hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
