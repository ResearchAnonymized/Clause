import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  BookOpen, Rocket, FileSearch, BookMarked, Bot, Activity, ScrollText, Users,
  Shield, Search, Sparkles, KeyRound, HelpCircle, CalendarClock, Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { resetOnboarding } from "@/components/onboarding-tour";
import { ProductTourStartButton } from "@/components/product-tour";

export const Route = createFileRoute("/_authenticated/settings/help")({
  head: () => ({ meta: [{ title: "Help & Documentation · Counterpart" }] }),
  component: HelpPage,
});

const sections = [
  {
    id: "quickstart",
    icon: Rocket,
    title: "Quick start",
    body: (
      <ol className="space-y-2 text-sm text-muted-foreground list-decimal pl-5">
        <li>Open <Link to="/runs/new" className="text-primary underline">New analysis</Link> and upload a supplier contract (PDF / DOCX / TXT).</li>
        <li>Pick a criteria set — Commercial contract review is the default; Finnish public procurement is an optional library.</li>
        <li>Watch the specialist agents work in real time on the run page.</li>
        <li>Review the Top-3 risks summary and export a PDF/CSV report.</li>
      </ol>
    ),
  },
  {
    id: "analyses",
    icon: FileSearch,
    title: "Analyses",
    body: (
      <p className="text-sm text-muted-foreground">
        Every uploaded contract becomes a <strong>run</strong>. Runs are workspace-scoped and searchable
        under <Link to="/runs" className="text-primary underline">Analyses</Link>. Each finding is
        tagged with a severity, a citation and the agent that produced it.
      </p>
    ),
  },
  {
    id: "criteria",
    icon: BookMarked,
    title: "Criteria library",
    body: (
      <p className="text-sm text-muted-foreground">
        Criteria describe what "good" looks like (SLA, DPA, InfoSec…). Edit prompts, add A/B variants and
        activate what should run. See <Link to="/criteria" className="text-primary underline">Criteria</Link>.
      </p>
    ),
  },
  {
    id: "agents",
    icon: Bot,
    title: "Agents",
    body: (
      <p className="text-sm text-muted-foreground">
        Specialist agents map 1:1 to criteria categories. Orchestrated by LangGraph (parse → specialists →
        reviewer). Model is switchable via LiteLLM.
      </p>
    ),
  },
  {
    id: "workspaces",
    icon: Users,
    title: "Workspaces & roles",
    body: (
      <p className="text-sm text-muted-foreground">
        Each account gets a personal workspace. Invite teammates as <Badge variant="outline">owner</Badge>{" "}
        <Badge variant="outline">admin</Badge> <Badge variant="outline">reviewer</Badge>{" "}
        <Badge variant="outline">viewer</Badge> under Workspace settings. Data is isolated by RLS.
      </p>
    ),
  },
  {
    id: "observability",
    icon: Activity,
    title: "Observability & cost",
    body: (
      <p className="text-sm text-muted-foreground">
        Track tokens, cost estimates and runtime per model in{" "}
        <Link to="/settings/observability" className="text-primary underline">Observability</Link>.
      </p>
    ),
  },
  {
    id: "audit",
    icon: ScrollText,
    title: "Audit log",
    body: (
      <p className="text-sm text-muted-foreground">
        Every create / update / role change is recorded. Review in{" "}
        <Link to="/settings/audit" className="text-primary underline">Audit log</Link>.
      </p>
    ),
  },
  {
    id: "webhooks",
    icon: Webhook,
    title: "Slack / Teams alerts",
    body: (
      <p className="text-sm text-muted-foreground">
        Paste an incoming webhook URL under{" "}
        <Link to="/settings/workspace" className="text-primary underline">Workspace settings</Link>. Counterpart posts
        a message every time an analysis finishes, colour-coded by severity.
      </p>
    ),
  },
  {
    id: "schedules",
    icon: CalendarClock,
    title: "Scheduled re-runs",
    body: (
      <div className="text-sm text-muted-foreground space-y-2">
        <p>
          Set up recurring analyses under <Link to="/settings/schedules" className="text-primary underline">Schedules</Link>.
          Each schedule re-uses the most recent completed run for its criteria set as a template.
        </p>
        <p>
          A background trigger must call the public cron endpoint:
        </p>
        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto"><code>{`POST /api/public/cron/schedules
Header: x-cron-secret: <your CRON_SECRET>`}</code></pre>
        <p>Wire this to pg_cron, GitHub Actions, Vercel Cron or any uptime monitor.</p>
      </div>
    ),
  },
  {
    id: "security",
    icon: Shield,
    title: "Security model",
    body: (
      <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
        <li>Row-Level Security on every table, scoped to workspace membership.</li>
        <li>Roles stored in a separate table, checked via <code>has_role()</code>.</li>
        <li>Uploaded documents live in a private storage bucket.</li>
        <li>Python worker authenticated via HMAC; cron endpoint via shared secret.</li>
      </ul>
    ),
  },
];

const faqs = [
  { q: "Which file types are supported?", a: "PDF, DOCX and TXT up to ~20 MB each." },
  { q: "How is my data isolated?", a: "Every table is filtered by workspace_id via RLS; you never see another workspace's runs, criteria, or findings." },
  { q: "Can I switch the underlying LLM?", a: "Yes. The worker uses LiteLLM — set the model per criterion or globally in worker settings." },
  { q: "What is a prompt A/B variant?", a: "Two prompts for one criterion. The system routes half of the findings through each so you can compare quality/cost." },
  { q: "How do I invite teammates?", a: "Settings → Workspace → Invite member. They receive a signup link scoped to your workspace." },
  { q: "Can I take a tour of the system?", a: "Yes, any time: map icon in the header, Tour the product in the sidebar, your profile menu, Settings, or Help." },
  { q: "Can I re-run getting started?", a: "Settings → Replay getting started, or Help. That restores the first-run checklist; it is separate from the product tour." },
];

function HelpPage() {
  const [q, setQ] = useState("");
  const filtered = sections.filter(
    (s) => !q || s.title.toLowerCase().includes(q.toLowerCase())
  );
  const filteredFaqs = faqs.filter(
    (f) => !q || (f.q + f.a).toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div className="max-w-5xl mx-auto p-6 md:p-8 space-y-8">
        <header className="space-y-2">
          <PageBack label="Back to settings" fallback={{ to: "/settings" }} />
          <PageBreadcrumbs items={[{ label: "Settings", to: "/settings" }, { label: "Help" }]} />
          <div data-tour-stage="help" className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" /> Documentation
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Help & Documentation</h1>
            <p className="text-muted-foreground max-w-2xl">
              Everything you need to run Counterpart — from first upload to enterprise rollout.
            </p>
          </div>
          <div className="pt-1 flex flex-wrap gap-2">
            <ProductTourStartButton variant="default" size="sm" />
            <Button variant="outline" size="sm" onClick={() => void resetOnboarding()}>
              Replay getting started
            </Button>
          </div>
          <div className="relative max-w-md pt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search docs…"
              className="pl-9"
            />
          </div>
        </header>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">Guides</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map((s) => (
              <Card key={s.id} id={s.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="h-8 w-8 rounded bg-primary/10 text-primary grid place-items-center">
                      <s.icon className="h-4 w-4" />
                    </span>
                    {s.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>{s.body}</CardContent>
              </Card>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No guides match "{q}".</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
            Frequently asked
          </h2>
          <Card>
            <CardContent className="pt-6">
              <Accordion type="single" collapsible className="w-full">
                {filteredFaqs.map((f, i) => (
                  <AccordionItem key={i} value={`faq-${i}`}>
                    <AccordionTrigger className="text-left text-sm">
                      <span className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        {f.q}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              {filteredFaqs.length === 0 && (
                <p className="text-sm text-muted-foreground">No FAQs match "{q}".</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" /> Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Keep criteria prompts specific — cite the customer template clause the agent should compare against.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-primary" /> Shortcuts
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div><kbd className="px-1.5 py-0.5 border rounded text-xs">G</kbd> then <kbd className="px-1.5 py-0.5 border rounded text-xs">D</kbd> — Dashboard</div>
              <div><kbd className="px-1.5 py-0.5 border rounded text-xs">N</kbd> — New analysis</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Need more?</CardTitle>
              <CardDescription>Reach the maintainers.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Contact your workspace owner or the Counterpart admin listed under{" "}
              <Link to="/admin" className="text-primary underline">Users & Roles</Link>.
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
