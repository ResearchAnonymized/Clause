import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { LAST_UPDATED, legalContact } from "@/lib/legal-content";
import { PRODUCT_NAME } from "@/config/instance";
import { ProductMark } from "@/components/product-mark";
import { PublicControls } from "@/components/public-controls";

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
  const contact = legalContact();
  const operator = contact.orgDisplay;
  return (
    <div className="min-h-screen bg-paper text-foreground">
      <header className="border-b border-white/10 bg-stage">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-3">
          <ProductMark inverted />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-2 text-xs text-white/70">
              <ShieldCheck className="h-4 w-4 text-white" /> Last updated {LAST_UPDATED}
            </span>
            <PublicControls inverted />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to {PRODUCT_NAME}
        </Link>
        <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-muted-foreground">{intro}</p>
        <div className="prose prose-neutral dark:prose-invert mt-10 max-w-none prose-headings:font-display prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-foreground prose-h2:text-xl prose-h2:mt-10 prose-h3:text-base prose-p:text-[15px] prose-li:text-[15px] prose-a:text-brand">
          {children}
        </div>
        <p className="mt-16 text-xs text-muted-foreground">
          This page is maintained by {operator}. It describes current practices for this {PRODUCT_NAME}{" "}
          instance and is not an independent certification.
        </p>
      </main>
    </div>
  );
}
