import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  FileText,
  FileCheck2,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PRODUCT_NAME } from "@/config/instance";
import { ProductMark } from "@/components/product-mark";
import { LandingAgentBoard, LandingHeroOrchestra } from "@/components/landing-agent-stage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${PRODUCT_NAME} — Contract intelligence` },
      {
        name: "description",
        content:
          "Specialist AI agents review a supplier pack against your reference documents and surface risks in minutes — with requirement-level evidence and a shareable report.",
      },
      { property: "og:title", content: `${PRODUCT_NAME} — Contract intelligence` },
      {
        property: "og:description",
        content:
          "Specialist AI agents review supplier drafts against your reference pack and surface risks in minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useTranslation();
  const title2 = t("landing.heroTitle2");

  return (
    <div className="min-h-screen bg-paper text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-stage">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-[4.25rem] flex items-center justify-between gap-3">
          <ProductMark inverted />
          <nav className="hidden lg:flex items-center gap-1 text-[13px] text-white/75">
            {[
              ["#stage", t("nav.product")],
              ["#how", t("nav.howItWorks")],
              ["#board", t("nav.agents")],
              ["#trust", t("nav.trust")],
            ].map(([href, label]) => (
              <a key={href} href={href} className="px-3 py-1.5 rounded-md hover:text-white hover:bg-white/10 transition-colors">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher inverted />
            <ThemeToggle inverted />
            <Link to="/auth" search={{ tab: "signin" }}>
              <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white">
                {t("nav.signIn")}
              </Button>
            </Link>
            <Link to="/request">
              <Button size="sm" className="bg-white text-stage hover:bg-white/90 font-semibold">
                {t("nav.requestAccess")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section id="stage" className="relative overflow-hidden bg-stage text-stage-foreground scroll-mt-24">
        <div className="landing-hero-grid absolute inset-0 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-12 lg:py-16 grid lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-10 lg:gap-12 items-center">
          <div className="order-2 lg:order-1 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
              {t("landing.badge")}
            </p>
            <h1 className="mt-4 font-display text-[2.7rem] sm:text-5xl lg:text-[3.35rem] font-semibold leading-[1.08] tracking-tight text-white">
              <span className="block">{t("landing.heroTitle1")}</span>
              <span className="block">{t("landing.heroTitleAccent")}</span>
              {title2 ? <span className="block">{title2}</span> : null}
            </h1>
            <p className="mt-4 mx-auto max-w-md text-base text-white/75 leading-snug">
              {t("landing.heroLead")}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link to="/request">
                <Button size="lg" className="h-11 px-5 bg-white text-stage hover:bg-white/90 font-semibold">
                  {t("landing.ctaPrimary")} <ArrowRight size={16} className="ml-2" />
                </Button>
              </Link>
              <a href="#how">
                <Button size="lg" variant="outline" className="h-11 px-5 border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  {t("landing.ctaSecondary")}
                </Button>
              </a>
            </div>
            <p className="mt-8 text-[12px] text-white/50 tracking-wide">
              {t("landing.stats.agentsN")} {t("landing.stats.agents")}
              <span className="mx-2 text-white/25">·</span>
              {t("landing.stats.reviewN")}
              <span className="mx-2 text-white/25">·</span>
              {t("landing.stats.traceableN")}
            </p>
          </div>
          <div className="order-1 lg:order-2">
            <LandingHeroOrchestra t={t} />
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t("landing.howKicker")}</p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground max-w-3xl">
            {t("landing.howTitle")}
          </h2>
          <div className="mt-12 grid lg:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border">
            <ProcessCol
              n="01"
              title={t("landing.steps.upload.title")}
              copy={t("landing.steps.upload.copy")}
              files={["Tender-invitation.pdf", "SLA-DPA.docx", "Annex.zip"]}
            />
            <ProcessCol
              n="02"
              title={t("landing.steps.orchestrate.title")}
              copy={t("landing.steps.orchestrate.copy")}
              pills={["SLA", "DPA", "InfoSec", "Notice", "Pricing", "Reviewer"]}
            />
            <ProcessCol
              n="03"
              title={t("landing.steps.report.title")}
              copy={t("landing.steps.report.copy")}
              files={["Decision-report.pdf", "Gap-brief.csv", "Evidence-pack.zip"]}
            />
          </div>
        </div>
      </section>

      <section className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t("landing.mappingKicker")}</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              {t("landing.mappingTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">{t("landing.mappingLead")}</p>
          </div>
          <MappingStage t={t} />
        </div>
      </section>

      <section id="board" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t("landing.operatingKicker")}</p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground max-w-3xl">
            {t("landing.agentsTitle")}
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">{t("landing.agentsLead")}</p>
          <div className="mt-10">
            <LandingAgentBoard t={t} />
          </div>
        </div>
      </section>

      <section id="trust" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-20 grid lg:grid-cols-2 gap-14">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t("landing.trustKicker")}</p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">{t("landing.trustTitle")}</h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">{t("landing.trustLead")}</p>
          </div>
          <ul className="space-y-2">
            {(["p1", "p2", "p3", "p4", "p5"] as const).map((k, i) => (
              <li key={k} className="flex gap-4 rounded-xl border border-border bg-card px-4 py-3.5">
                <span className="font-display text-lg text-brand tabular-nums w-7 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm text-foreground/85 leading-relaxed">{t(`landing.trustPoints.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{PRODUCT_NAME}</p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
            {t("landing.ctaFinalTitle")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("landing.ctaFinalLead")}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/request">
              <Button size="lg" className="h-12 px-7 bg-brand text-brand-foreground hover:bg-brand/90 font-semibold">
                {t("nav.requestAccess")} <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
            <Link to="/auth" search={{ tab: "signin" }}>
              <Button size="lg" variant="outline" className="h-12 px-7 border-border text-foreground hover:bg-muted">
                {t("nav.signIn")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="bg-stage text-white/70 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid sm:grid-cols-3 gap-10 text-sm">
          <div>
            <ProductMark inverted />
            <p className="mt-4 text-xs text-white/50 max-w-xs">{t("landing.enterpriseTitle")}</p>
            <p className="mt-3 text-xs text-white/40">© {new Date().getFullYear()} {PRODUCT_NAME}</p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white">{t("nav.product")}</p>
            <a href="#how" className="block hover:text-white">{t("nav.howItWorks")}</a>
            <a href="#board" className="block hover:text-white">{t("nav.agents")}</a>
            <a href="#trust" className="block hover:text-white">{t("nav.trust")}</a>
            <Link to="/auth" search={{ tab: "signin" }} className="block hover:text-white">{t("nav.signIn")}</Link>
            <Link to="/request" className="block hover:text-white">{t("nav.requestAccess")}</Link>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white">{t("nav.trust")}</p>
            <Link to="/privacy" className="block hover:text-white">Privacy</Link>
            <Link to="/terms" className="block hover:text-white">Terms</Link>
            <Link to="/dpa" className="block hover:text-white">DPA</Link>
            <Link to="/security" className="block hover:text-white">Security</Link>
            <Link to="/verify" className="block hover:text-white">Verify</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MappingStage({ t }: { t: (k: string) => string }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-[0_24px_60px_-28px_rgba(10,36,114,0.22)]">
      <div className="grid grid-cols-2 text-[11px] uppercase tracking-wider font-semibold bg-stage text-white">
        <div className="px-4 py-2.5 border-r border-white/10">{t("landing.sampleTender")}</div>
        <div className="px-4 py-2.5">{t("landing.sampleBidder")}</div>
      </div>
      <div className="grid grid-cols-2">
        <QuoteCell
          side="req"
          title="Art. 28 processor duties"
          quote="Processor shall not engage another processor without prior written authorisation of the controller."
        />
        <QuoteCell
          side="bid"
          title="Sub-processors"
          quote="Provider may appoint sub-processors and will notify Customer of material changes where reasonably practicable."
          gap
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/40">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-border max-w-xs">
          <div className="bg-critical w-[22%]" />
          <div className="bg-warning w-[28%]" />
          <div className="bg-ok w-[50%]" />
        </div>
        <span className="text-xs text-muted-foreground">Coverage 72 · 3 critical</span>
      </div>
    </div>
  );
}

function QuoteCell({
  title,
  quote,
  gap,
}: {
  side: "req" | "bid";
  title: string;
  quote: string;
  gap?: boolean;
}) {
  return (
    <div className={`p-4 ${gap ? "bg-critical/5" : "bg-card"} border-t border-border first:border-r`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {gap ? <span className="text-[10px] font-medium text-critical">Gap</span> : null}
      </div>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground italic">
        <Quote size={12} className="inline mr-1 opacity-40" />
        {quote}
      </p>
    </div>
  );
}

function ProcessCol({
  n,
  title,
  copy,
  files,
  pills,
}: {
  n: string;
  title: string;
  copy: string;
  files?: string[];
  pills?: string[];
}) {
  return (
    <article className="bg-card p-7 min-h-[280px]">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-3xl text-brand">{n}</span>
        <FileCheck2 size={18} className="text-brand" />
      </div>
      <h3 className="mt-6 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{copy}</p>
      {files && (
        <ul className="mt-5 space-y-1.5">
          {files.map((f) => (
            <li key={f} className="flex items-center gap-2 text-xs text-foreground bg-muted/40 border border-border rounded-md px-2.5 py-1.5">
              <FileText size={12} /> {f}
            </li>
          ))}
        </ul>
      )}
      {pills && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <span key={p} className="text-[11px] rounded-full bg-stage text-white px-2.5 py-1">
              {p}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
