import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, FileText, Quote } from "lucide-react";
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

const ease = [0.22, 1, 0.36, 1] as const;

function Landing() {
  const { t } = useTranslation();
  const title2 = t("landing.heroTitle2");
  const reduce = useReducedMotion();

  return (
    <div className="landing-page min-h-screen bg-paper text-foreground flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/8 bg-stage/75 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-[4.25rem] flex items-center justify-between gap-3">
          <ProductMark inverted />
          <nav className="hidden lg:flex items-center gap-1 text-[13px] text-white/70">
            {[
              ["#stage", t("nav.product")],
              ["#how", t("nav.howItWorks")],
              ["#board", t("nav.agents")],
              ["#trust", t("nav.trust")],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="px-3 py-1.5 rounded-full hover:text-white hover:bg-white/10 transition-colors"
              >
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
              <Button size="sm" className="bg-white text-stage hover:bg-white/90 font-semibold shadow-sm">
                {t("nav.requestAccess")}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <section id="stage" className="relative overflow-hidden bg-stage text-stage-foreground scroll-mt-24">
        <div className="landing-hero-grid absolute inset-0 pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <span className="landing-orb landing-orb-a" />
          <span className="landing-orb landing-orb-b" />
          <span className="landing-orb landing-orb-c" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-16 lg:py-24 grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-12 lg:gap-16 items-center">
          <div className="order-2 lg:order-1 text-center lg:text-left">
            <motion.p
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60"
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease }}
            >
              {t("landing.badge")}
            </motion.p>
            <h1 className="mt-5 font-display text-[2.85rem] sm:text-5xl lg:text-[3.6rem] font-semibold leading-[1.05] tracking-tight text-white">
              <motion.span
                className="block"
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.08, ease }}
              >
                {t("landing.heroTitle1")}
              </motion.span>
              <motion.span
                className="block italic font-medium text-[#f0e2c4]"
                initial={reduce ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease }}
              >
                {t("landing.heroTitleAccent")}
              </motion.span>
              {title2 ? (
                <motion.span
                  className="block"
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.65, delay: 0.28, ease }}
                >
                  {title2}
                </motion.span>
              ) : null}
            </h1>
            <motion.p
              className="mt-5 mx-auto lg:mx-0 max-w-md text-[17px] text-white/72 leading-relaxed"
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.32, ease }}
            >
              {t("landing.heroLead")}
            </motion.p>
            <motion.div
              className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.42, ease }}
            >
              <Link to="/request">
                <Button
                  size="lg"
                  className="h-12 px-6 bg-white text-stage hover:bg-white/90 font-semibold shadow-[0_10px_30px_-12px_rgba(255,255,255,0.7)]"
                >
                  {t("landing.ctaPrimary")}
                  <span className="landing-arrow-nudge ml-2">
                    <ArrowRight size={16} />
                  </span>
                </Button>
              </Link>
              <a href="#how">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur-sm"
                >
                  {t("landing.ctaSecondary")}
                </Button>
              </a>
            </motion.div>
            <div className="mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-2">
              {[
                `${t("landing.stats.agentsN")} ${t("landing.stats.agents")}`,
                t("landing.stats.reviewN"),
                t("landing.stats.traceableN"),
              ].map((label, i) => (
                <motion.span
                  key={label}
                  className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-[12px] text-white/70"
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.52 + i * 0.08, ease }}
                >
                  {label}
                </motion.span>
              ))}
            </div>
          </div>
          <motion.div
            className="order-1 lg:order-2"
            initial={reduce ? false : { opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.12, ease }}
          >
            <div className="landing-float">
              <LandingHeroOrchestra t={t} />
            </div>
          </motion.div>
        </div>
      </section>

      <section id="how" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("landing.howKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground max-w-2xl">
              {t("landing.howTitle")}
            </h2>
          </Reveal>
          <div className="mt-14 grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr] gap-5 items-stretch">
            <ProcessCol
              n="01"
              delay={0}
              title={t("landing.steps.upload.title")}
              copy={t("landing.steps.upload.copy")}
              files={["Tender-invitation.pdf", "SLA-DPA.docx", "Annex.zip"]}
            />
            <StepJoin />
            <ProcessCol
              n="02"
              delay={0.08}
              title={t("landing.steps.orchestrate.title")}
              copy={t("landing.steps.orchestrate.copy")}
              pills={["SLA", "DPA", "InfoSec", "Notice", "Pricing", "Reviewer"]}
            />
            <StepJoin />
            <ProcessCol
              n="03"
              delay={0.16}
              title={t("landing.steps.report.title")}
              copy={t("landing.steps.report.copy")}
              files={["Decision-report.pdf", "Gap-brief.csv", "Evidence-pack.zip"]}
            />
          </div>
        </div>
      </section>

      <section className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24 grid lg:grid-cols-[0.9fr_1.1fr] gap-14 items-center">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("landing.mappingKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              {t("landing.mappingTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed text-[17px]">{t("landing.mappingLead")}</p>
          </Reveal>
          <Reveal delay={0.1}>
            <MappingStage t={t} />
          </Reveal>
        </div>
      </section>

      <section id="board" className="scroll-mt-24 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("landing.operatingKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground max-w-2xl">
              {t("landing.agentsTitle")}
            </h2>
            <p className="mt-4 max-w-2xl text-muted-foreground text-[17px] leading-relaxed">{t("landing.agentsLead")}</p>
          </Reveal>
          <Reveal delay={0.08} className="mt-12">
            <LandingAgentBoard t={t} />
          </Reveal>
        </div>
      </section>

      <section id="trust" className="scroll-mt-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-24 grid lg:grid-cols-2 gap-16">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t("landing.trustKicker")}
            </p>
            <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              {t("landing.trustTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed text-[17px]">{t("landing.trustLead")}</p>
          </Reveal>
          <ul className="space-y-3">
            {(["p1", "p2", "p3", "p4", "p5"] as const).map((k, i) => (
              <Reveal key={k} delay={i * 0.06}>
                <li className="flex gap-4 rounded-2xl border border-border/80 bg-card/80 px-5 py-4 shadow-[0_1px_0_rgba(10,36,114,0.04)]">
                  <span className="font-display text-lg text-brand tabular-nums w-7 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm text-foreground/85 leading-relaxed">{t(`landing.trustPoints.${k}`)}</span>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative overflow-hidden bg-stage text-white">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <span className="landing-orb landing-orb-a" />
          <span className="landing-orb landing-orb-b" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 py-24 text-center">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">{PRODUCT_NAME}</p>
            <h2 className="mt-4 font-display text-3xl sm:text-[2.6rem] font-semibold tracking-tight text-white">
              {t("landing.ctaFinalTitle")}
            </h2>
            <p className="mt-4 text-white/70 text-[17px] leading-relaxed">{t("landing.ctaFinalLead")}</p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/request">
                <Button size="lg" className="h-12 px-7 bg-white text-stage hover:bg-white/90 font-semibold">
                  {t("nav.requestAccess")}
                  <span className="landing-arrow-nudge ml-2">
                    <ArrowRight size={16} />
                  </span>
                </Button>
              </Link>
              <Link to="/auth" search={{ tab: "signin" }}>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-7 border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  {t("nav.signIn")}
                </Button>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="bg-[#07163f] text-white/65">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid sm:grid-cols-3 gap-10 text-sm">
          <div>
            <ProductMark inverted />
            <p className="mt-4 text-xs text-white/45 max-w-xs">{t("landing.enterpriseTitle")}</p>
            <p className="mt-3 text-xs text-white/35">
              © {new Date().getFullYear()} {PRODUCT_NAME}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white">{t("nav.product")}</p>
            <a href="#how" className="block hover:text-white transition-colors">
              {t("nav.howItWorks")}
            </a>
            <a href="#board" className="block hover:text-white transition-colors">
              {t("nav.agents")}
            </a>
            <a href="#trust" className="block hover:text-white transition-colors">
              {t("nav.trust")}
            </a>
            <Link to="/auth" search={{ tab: "signin" }} className="block hover:text-white transition-colors">
              {t("nav.signIn")}
            </Link>
            <Link to="/request" className="block hover:text-white transition-colors">
              {t("nav.requestAccess")}
            </Link>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white">{t("nav.trust")}</p>
            <Link to="/privacy" className="block hover:text-white transition-colors">
              Privacy
            </Link>
            <Link to="/terms" className="block hover:text-white transition-colors">
              Terms
            </Link>
            <Link to="/dpa" className="block hover:text-white transition-colors">
              DPA
            </Link>
            <Link to="/security" className="block hover:text-white transition-colors">
              Security
            </Link>
            <Link to="/verify" className="block hover:text-white transition-colors">
              Verify
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.65, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

function MappingStage({ t }: { t: (k: string) => string }) {
  const reduce = useReducedMotion();
  return (
    <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-[0_28px_70px_-32px_rgba(10,36,114,0.28)]">
      <div className="grid grid-cols-2 text-[11px] uppercase tracking-wider font-semibold bg-stage text-white">
        <div className="px-4 py-2.5 border-r border-white/10">{t("landing.sampleTender")}</div>
        <div className="px-4 py-2.5">{t("landing.sampleBidder")}</div>
      </div>
      <div className="relative grid grid-cols-2">
        <QuoteCell
          title="Art. 28 processor duties"
          quote="Processor shall not engage another processor without prior written authorisation of the controller."
        />
        <QuoteCell
          title="Sub-processors"
          quote="Provider may appoint sub-processors and will notify Customer of material changes where reasonably practicable."
          gap
        />
        <motion.span
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full border border-critical/40 bg-card px-2 py-0.5 text-[10px] font-semibold text-critical shadow-sm"
          initial={reduce ? false : { opacity: 0, scale: 0.7 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: 0.35, ease }}
        >
          Critical
        </motion.span>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-t border-border bg-muted/40">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-border max-w-xs">
          <motion.div
            className="bg-critical"
            initial={reduce ? { width: "22%" } : { width: 0 }}
            whileInView={{ width: "22%" }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.15, ease }}
          />
          <motion.div
            className="bg-warning"
            initial={reduce ? { width: "28%" } : { width: 0 }}
            whileInView={{ width: "28%" }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.28, ease }}
          />
          <motion.div
            className="bg-ok"
            initial={reduce ? { width: "50%" } : { width: 0 }}
            whileInView={{ width: "50%" }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.4, ease }}
          />
        </div>
        <span className="text-xs text-muted-foreground">Coverage 72 · 3 critical</span>
      </div>
    </div>
  );
}

function QuoteCell({ title, quote, gap }: { title: string; quote: string; gap?: boolean }) {
  return (
    <div className={`relative overflow-hidden p-5 ${gap ? "bg-critical/5" : "bg-card"} border-t border-border first:border-r`}>
      {gap ? <span className="landing-scan" aria-hidden /> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {gap ? <span className="text-[10px] font-medium text-critical">Critical</span> : null}
      </div>
      <p className="mt-2 font-sans text-[13px] leading-relaxed text-muted-foreground italic">
        <Quote size={12} className="inline mr-1 opacity-40" />
        {quote}
      </p>
    </div>
  );
}

function StepJoin() {
  const reduce = useReducedMotion();
  return (
    <div className="hidden lg:flex items-center justify-center" aria-hidden>
      <motion.span
        className="landing-step-join text-brand/50"
        initial={reduce ? false : { opacity: 0, x: -6 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.35, ease }}
      >
        <ArrowRight size={20} />
      </motion.span>
    </div>
  );
}

function ProcessCol({
  n,
  title,
  copy,
  files,
  pills,
  delay,
}: {
  n: string;
  title: string;
  copy: string;
  files?: string[];
  pills?: string[];
  delay: number;
}) {
  const reduce = useReducedMotion();
  return (
    <Reveal delay={delay}>
      <article className="h-full rounded-2xl border border-border/80 bg-card p-7 min-h-[280px] shadow-[0_1px_0_rgba(10,36,114,0.04)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-28px_rgba(10,36,114,0.28)]">
        <span className="font-display text-3xl text-brand">{n}</span>
        <h3 className="mt-6 text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{copy}</p>
        {files && (
          <ul className="mt-6 space-y-1.5">
            {files.map((f, i) => (
              <motion.li
                key={f}
                className="flex items-center gap-2 text-xs text-foreground bg-muted/50 border border-border/70 rounded-lg px-2.5 py-1.5"
                initial={reduce ? false : { opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: delay + 0.18 + i * 0.1, ease }}
              >
                <FileText size={12} className="text-brand/70" /> {f}
              </motion.li>
            ))}
          </ul>
        )}
        {pills && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {pills.map((p, i) => (
              <motion.span
                key={p}
                className="text-[11px] rounded-full bg-stage text-white px-2.5 py-1"
                initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: delay + 0.18 + i * 0.06, ease }}
              >
                {p}
              </motion.span>
            ))}
          </div>
        )}
      </article>
    </Reveal>
  );
}
