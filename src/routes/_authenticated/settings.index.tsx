import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { resetOnboarding } from "@/components/onboarding-tour";
import { ProductTourStartButton } from "@/components/product-tour";
import {
  HelpCircle,
  Cpu,
  MessageSquare,
  CalendarClock,
  Activity,
  ScrollText,
  Users,
  BookOpen,
  ChevronRight,
  ShieldCheck,
  FileOutput,
  GitBranch,
  Building2,
} from "lucide-react";
import { PageBack } from "@/components/page-back";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({ meta: [{ title: "Settings — Counterpart" }] }),
  component: SettingsPage,
});

const ADMIN_TABS = [
  { key: "organization", url: "/settings/organization", icon: Building2, label: "Organization" },
  { key: "aiModels", url: "/settings/llm", icon: Cpu, label: "AI models" },
  { key: "agentPrompts", url: "/settings/prompts", icon: MessageSquare, label: "Agent prompts" },
  { key: "pipelineDag", url: "/settings/pipeline", icon: GitBranch, label: "Pipeline DAG" },
  { key: "reportTemplates", url: "/settings/templates", icon: FileOutput, label: "Report templates" },
  { key: "schedules", url: "/settings/schedules", icon: CalendarClock, label: "Schedules" },
  { key: "observability", url: "/settings/observability", icon: Activity, label: "Observability" },
  { key: "errors", url: "/settings/errors", icon: HelpCircle, label: "Error log" },
  { key: "audit", url: "/settings/audit", icon: ScrollText, label: "Audit log" },
  { key: "users", url: "/admin", icon: Users, label: "Platform users" },
  { key: "privacy", url: "/settings/privacy", icon: ShieldCheck, label: "Privacy & data" },
  { key: "help", url: "/settings/help", icon: BookOpen, label: "Help" },
] as const;

function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      setDisplayName(data?.display_name ?? "");
    });
  }, [user]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t("settingsPage.profileUpdated"));
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-8">
      <div className="space-y-2" data-tour-stage="settings">
        <PageBack label="Back to analyses" fallback={{ to: "/runs" }} />
        <h1 className="text-2xl font-semibold tracking-tight">{t("settingsPage.profileTitle")}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t("settingsPage.profileSubtitle")}</p>
      </div>

      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b bg-muted/20">
          <h2 className="text-sm font-semibold">{t("settingsPage.yourDetails")}</h2>
        </div>
        <div className="p-5">
          <form onSubmit={save} className="space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <Label>{t("settingsPage.email")}</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>{t("settingsPage.displayName")}</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy}>{busy ? t("common.saving") : t("common.save")}</Button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Administration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organization &amp; workspace settings, models, logs, and platform access.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {ADMIN_TABS.map((tab) => (
            <Link
              key={tab.url}
              to={tab.url}
              className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border bg-card hover:bg-muted/40 hover:border-brand/25 transition-colors group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-9 w-9 rounded-lg bg-brand-soft text-brand grid place-items-center shrink-0">
                  <tab.icon className="w-4 h-4" />
                </span>
                <span className="text-sm font-medium truncate">
                  {tab.key === "reportTemplates"
                    ? "Report templates"
                    : t(`sidebar.${tab.key}`, { defaultValue: tab.label })}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">{t("settingsPage.helpTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-3">{t("settingsPage.helpBody")}</p>
        <div className="flex flex-wrap gap-2">
          <ProductTourStartButton variant="default" size="sm" />
          <Button variant="outline" size="sm" onClick={() => void resetOnboarding()}>
            <HelpCircle className="w-4 h-4 mr-2" /> {t("settingsPage.restartTour")}
          </Button>
        </div>
      </section>
    </div>
  );
}
