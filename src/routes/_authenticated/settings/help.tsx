import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, ListOrdered } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageBack, PageBreadcrumbs } from "@/components/page-back";
import { resetOnboarding } from "@/components/onboarding-tour";
import { ProductTourStartButton } from "@/components/product-tour";

export const Route = createFileRoute("/_authenticated/settings/help")({
  head: () => ({ meta: [{ title: "Help · Counterpart" }] }),
  component: HelpPage,
});

function HelpPage() {
  const { t } = useTranslation();
  const steps = [
    { title: t("helpPage.step1Title"), body: t("helpPage.step1Body") },
    { title: t("helpPage.step2Title"), body: t("helpPage.step2Body") },
    { title: t("helpPage.step3Title"), body: t("helpPage.step3Body") },
    { title: t("helpPage.step4Title"), body: t("helpPage.step4Body") },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 space-y-8">
      <header className="space-y-2">
        <PageBack label={t("helpPage.backToSettings")} fallback={{ to: "/settings" }} />
        <PageBreadcrumbs items={[{ label: t("sidebar.settings"), to: "/settings" }, { label: t("sidebar.help") }]} />
        <div data-tour-stage="help" className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            {t("helpPage.kicker")}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("helpPage.title")}</h1>
          <p className="text-muted-foreground max-w-2xl">{t("helpPage.subtitle")}</p>
        </div>
        <div className="pt-1 flex flex-wrap gap-2">
          <ProductTourStartButton variant="default" size="sm" />
          <Button variant="outline" size="sm" onClick={() => void resetOnboarding()}>
            {t("helpPage.replay")}
          </Button>
        </div>
      </header>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
          <ListOrdered className="h-4 w-4" />
          {t("helpPage.stepsTitle")}
        </h2>
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s.title}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {i + 1}. {s.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  {s.body}
                  {i === 0 ? (
                    <div className="mt-3">
                      <Button asChild size="sm">
                        <Link to="/runs/new">{t("helpPage.newAnalysis")}</Link>
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("helpPage.limitsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">{t("helpPage.limitsBody")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("helpPage.samplesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">{t("helpPage.samplesBody")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("helpPage.languageTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">{t("helpPage.languageBody")}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("helpPage.moreTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground leading-relaxed">
            {t("helpPage.moreBody")}{" "}
            <Link to="/admin" className="text-primary underline">
              {t("helpPage.people")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
