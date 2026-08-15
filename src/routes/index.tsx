import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Sparkles,
  FileText,
  Cpu,
  FileCheck2,
  ShieldCheck,
  Lock,
  Gauge,
  CheckCircle2,
  CircleAlert,
  AlertOctagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentConstellation } from "@/components/agent-constellation";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clause — Multi-agent contract intelligence for 2M-IT" },
      {
        name: "description",
        content:
          "Specialist AI agents review supplier contracts against your 2M-IT template and surface risks in minutes — with clause-level evidence and a shareable report.",
      },
      { property: "og:title", content: "Clause — Multi-agent contract intelligence" },
      {
        property: "og:description",
        content:
          "Specialist AI agents review supplier contracts against your 2M-IT template and surface risks in minutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
};



function Landing() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <header className="border-b border-border/60 bg-background/75 backdrop-blur-xl sticky top-0 z-40">
        <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight shrink-0">
            <span className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand to-brand/70 text-brand-foreground grid place-items-center font-bold shadow-sm shadow-brand/30">
              C
            </span>
            <span className="text-base">Clause</span>
            <span className="hidden sm:inline text-[10px] uppercase tracking-widest text-muted-foreground border-l border-border/60 pl-2 ml-1">
              2M-IT
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm text-muted-foreground">
            <a href="#features" className="px-3 py-1.5 rounded-md hover:text-foreground hover:bg-accent/50 transition-colors">{t("landing.featuresTitle").split(" ").slice(0, 2).join(" ")}</a>
            <a href="#agents" className="px-3 py-1.5 rounded-md hover:text-foreground hover:bg-accent/50 transition-colors">{t("nav.agents")}</a>
            <a href="#how" className="px-3 py-1.5 rounded-md hover:text-foreground hover:bg-accent/50 transition-colors">{t("nav.howItWorks")}</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <div className="h-6 w-px bg-border/60 mx-1 hidden sm:block" />
            <Link to="/auth" className="hidden sm:block"><Button variant="ghost" size="sm">{t("nav.signIn")}</Button></Link>
            <Link to="/auth">
              <Button size="sm" className="bg-brand text-brand-foreground hover:bg-brand/90 shadow-sm shadow-brand/20">
                {t("nav.startFree")} <ArrowRight size={14} className="ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero — centered */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--brand)_16%,transparent),transparent_60%)]" />
        <div className="mx-auto max-w-4xl px-6 pt-20 pb-10 text-center">
          <motion.span
            {...fadeUp}
            className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft px-3 py-1 text-xs font-medium text-brand"
          >
            <Sparkles size={14} /> {t("landing.badge")}
          </motion.span>
          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-brand leading-[1.05]"
          >
            {t("landing.heroTitle1")} <br className="hidden sm:block" />
            <span className="bg-gradient-to-br from-brand to-[oklch(0.45_0.16_265)] bg-clip-text text-transparent">
              {t("landing.heroTitleAccent")}
            </span>{" "}
            {t("landing.heroTitle2")}
          </motion.h1>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="mt-5 mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed"
          >
            {t("landing.heroLead")}
          </motion.p>
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.15 }}
            className="mt-8 flex flex-wrap justify-center gap-3"
          >
            <Link to="/auth">
              <Button size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90 h-12 px-6 shadow-lg shadow-brand/25">
                {t("landing.ctaPrimary")} <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline" className="h-12 px-6">
                {t("landing.ctaSecondary")}
              </Button>
            </a>
          </motion.div>
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.2 }}
            className="mt-8 flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs text-muted-foreground"
          >
            <div className="flex items-center gap-2"><Lock size={14} /> {t("landing.trustPrivate")}</div>
            <div className="flex items-center gap-2"><ShieldCheck size={14} /> {t("landing.trustGdpr")}</div>
            <div className="flex items-center gap-2"><Gauge size={14} /> {t("landing.trustMinutes")}</div>
          </motion.div>
        </div>

        {/* Product mock */}
        <div className="mx-auto max-w-5xl px-6 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand/25 via-brand/10 to-transparent blur-3xl" />
            <div className="rounded-2xl border border-border bg-gradient-to-br from-brand/90 to-brand p-2 shadow-2xl shadow-brand/25">
              <ProductShot />
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works — 3 steps */}
      <section id="how" className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <motion.div {...fadeUp} className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-brand">
              {t("landing.howWorksTitle")}
            </h2>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { n: 1, icon: FileText, key: "s1" },
              { n: 2, icon: Cpu, key: "s2" },
              { n: 3, icon: FileCheck2, key: "s3" },
            ].map((s, i) => (
              <motion.div
                key={s.key}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: i * 0.08 }}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded-full bg-brand text-brand-foreground text-sm font-semibold grid place-items-center shrink-0">
                    {s.n}
                  </span>
                  <s.icon size={18} className="text-brand" />
                </div>
                <p className="mt-4 text-sm text-foreground/85 leading-relaxed">{t(`landing.howSteps.${s.key}`)}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents */}
      <section id="agents" className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <motion.div {...fadeUp} className="text-center max-w-2xl mx-auto">
            <div className="text-xs font-semibold uppercase tracking-wider text-brand">{t("landing.agentsKicker")}</div>
            <h2 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-brand">
              {t("landing.agentsTitle")}
            </h2>
            <p className="mt-4 text-muted-foreground">{t("landing.agentsLead")}</p>
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="mt-14">
            <AgentConstellation />
          </motion.div>
        </div>
      </section>


      {/* Final CTA */}
      <section className="relative border-b border-border/60 overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklab,var(--brand)_20%,transparent),transparent_60%)]" />
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <motion.h2 {...fadeUp} className="text-3xl sm:text-4xl font-semibold tracking-tight text-brand">
            {t("landing.ctaFinalTitle")}
          </motion.h2>
          <motion.p {...fadeUp} className="mt-4 text-muted-foreground max-w-xl mx-auto">
            {t("landing.ctaFinalLead")}
          </motion.p>
          <motion.div {...fadeUp} className="mt-8 flex justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90 h-12 px-6 shadow-lg shadow-brand/25">
                {t("landing.ctaPrimary")} <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded bg-brand text-brand-foreground grid place-items-center text-xs font-bold">C</span>
            <span>© {new Date().getFullYear()} Clause · for 2M-IT</span>
          </div>
          <div className="flex items-center gap-5 text-xs flex-wrap justify-end">
            <a href="#features" className="hover:text-foreground">{t("landing.featuresTitle").split(" ").slice(0, 2).join(" ")}</a>
            <a href="#agents" className="hover:text-foreground">{t("nav.agents")}</a>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/dpa" className="hover:text-foreground">DPA</Link>
            <Link to="/security" className="hover:text-foreground">Security</Link>
            <Link to="/verify" className="hover:text-foreground">Verify</Link>
            <Link to="/auth" className="hover:text-foreground">{t("nav.signIn")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ---------- Product mock shot: composed dashboard preview ---------- */

function ProductShot() {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl overflow-hidden bg-background border border-border/40">
      {/* window chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/40">
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.7_0.18_25)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.8_0.15_85)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[oklch(0.7_0.15_150)]" />
        <div className="ml-4 flex-1 max-w-md rounded-md bg-background border border-border px-3 py-1 text-[11px] text-muted-foreground">
          clause.app/runs/analysis-2m-it-supplier-42
        </div>
      </div>

      <div className="grid grid-cols-[180px_1fr] min-h-[420px]">
        {/* sidebar */}
        <div className="border-r border-border bg-brand text-brand-foreground p-3 hidden sm:block">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-brand-foreground/60 mb-2 px-2">Workspace</div>
          {[
            { label: "Dashboard", active: false },
            { label: "Analyses", active: true },
            { label: "Criteria Library", active: false },
            { label: "Agents", active: false },
            { label: "Audit Log", active: false },
            { label: "Settings", active: false },
          ].map((item) => (
            <div
              key={item.label}
              className={`px-2 py-1.5 rounded text-[11px] mb-0.5 ${
                item.active ? "bg-brand-foreground/15 text-brand-foreground" : "text-brand-foreground/70"
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>

        {/* main */}
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Analysis #42</div>
              <div className="font-semibold text-base mt-0.5">CloudNordic — Managed Services Agreement</div>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[oklch(0.7_0.15_150)]/15 text-[oklch(0.45_0.15_150)] font-medium">
              Completed · 2m 14s
            </span>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-3 gap-2">
            <KpiCard label={t("report.complianceScore")} value="72" tone="brand" />
            <KpiCard label={t("report.riskExposure")} value="Medium" tone="warn" />
            <KpiCard label={t("report.critical")} value="3" tone="crit" />
          </div>

          {/* findings */}
          <div className="rounded-lg border border-border bg-card">
            <div className="px-3 py-2 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Top findings
            </div>
            <div className="divide-y divide-border">
              <FindingRow sev="crit" agent="DPA" text="No signed Data Processing Agreement referenced." />
              <FindingRow sev="crit" agent="SLA" text="Uptime SLA 99.0% below 2M-IT baseline (99.9%)." />
              <FindingRow sev="warn" agent="Pricing" text="Annual CPI escalation uncapped." />
              <FindingRow sev="warn" agent="Notice" text="Auto-renewal with 12-month notice period." />
              <FindingRow sev="ok"   agent="InfoSec" text="ISO/IEC 27001 certification confirmed." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: "brand" | "warn" | "crit" }) {
  const bg =
    tone === "brand" ? "bg-brand-soft text-brand" :
    tone === "warn"  ? "bg-[oklch(0.8_0.15_85)]/15 text-[oklch(0.5_0.15_60)]" :
                       "bg-[oklch(0.7_0.18_25)]/15 text-[oklch(0.5_0.18_25)]";
  return (
    <div className={`rounded-lg px-3 py-2.5 ${bg}`}>
      <div className="text-[9px] uppercase tracking-widest opacity-80">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function FindingRow({ sev, agent, text }: { sev: "crit" | "warn" | "ok"; agent: string; text: string }) {
  const Icon = sev === "crit" ? AlertOctagon : sev === "warn" ? CircleAlert : CheckCircle2;
  const color =
    sev === "crit" ? "text-[oklch(0.55_0.18_25)]" :
    sev === "warn" ? "text-[oklch(0.55_0.15_60)]" :
                     "text-[oklch(0.5_0.15_150)]";
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <Icon size={16} className={`${color} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] leading-snug text-foreground/90">{text}</div>
      </div>
      <span className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/50 text-muted-foreground shrink-0">
        {agent}
      </span>
    </div>
  );
}
