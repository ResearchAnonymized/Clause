import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const BLUE = "#0A2472";

export function ProductMark({
  className,
  to = "/",
  inverted = false,
  showWord = true,
}: {
  className?: string;
  to?: "/" | "/dashboard";
  inverted?: boolean;
  showWord?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}
    >
      <CounterpartGlyph inverted={inverted} />
      {showWord ? (
        <span
          className={cn(
            "font-sans text-[15px] leading-none",
            inverted ? "text-stage-foreground" : "text-foreground",
          )}
        >
          CounterPart
        </span>
      ) : null}
    </Link>
  );
}

/** Two contract pages with a compare-gap — tender vs counterpart. */
export function CounterpartGlyph({
  inverted = false,
  className,
}: {
  inverted?: boolean;
  className?: string;
}) {
  const field = inverted ? "#fff" : BLUE;
  const page = inverted ? BLUE : "#fff";
  const line = inverted ? "rgba(255,255,255,0.45)" : "rgba(10,36,114,0.28)";
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill={field} />
      <rect x="5" y="7.5" width="10.5" height="17" rx="1.5" fill={page} />
      <rect x="7" y="12.5" width="6.5" height="1.2" rx="0.4" fill={line} />
      <rect x="7" y="15.6" width="5" height="1.2" rx="0.4" fill={line} />
      <rect x="7" y="18.7" width="5.8" height="1.2" rx="0.4" fill={line} />
      <rect x="16.5" y="7.5" width="10.5" height="17" rx="1.5" fill={page} />
      <rect x="18.5" y="12.5" width="6.5" height="1.2" rx="0.4" fill={line} />
      <rect x="18.5" y="15.6" width="5" height="1.2" rx="0.4" fill={line} />
      <rect x="18.5" y="18.7" width="5.8" height="1.2" rx="0.4" fill={line} />
    </svg>
  );
}
