import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LAST_UPDATED } from "@/lib/legal-content";

/** Shared frame for public legal pages — matches the landing design system. */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Clause
          </Link>
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" /> Last updated {LAST_UPDATED}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted-foreground">{intro}</p>
        <div className="prose prose-neutral dark:prose-invert mt-10 max-w-none prose-headings:font-semibold prose-headings:tracking-tight prose-h2:text-xl prose-h2:mt-10 prose-h3:text-base prose-p:text-[15px] prose-li:text-[15px] prose-a:text-primary">
          {children}
        </div>
        <p className="mt-16 text-xs text-muted-foreground">
          This page is maintained by 2M-IT Oy as the operator of Clause. It describes current
          practices for this instance and is not an independent certification.
        </p>
      </main>
    </div>
  );
}
