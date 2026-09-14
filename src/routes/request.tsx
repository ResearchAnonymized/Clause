import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PRODUCT_NAME } from "@/config/instance";
import { ProductMark } from "@/components/product-mark";
import { PublicControls } from "@/components/public-controls";

export const Route = createFileRoute("/request")({
  head: () => ({
    meta: [
      { title: `Request access — ${PRODUCT_NAME}` },
      {
        name: "description",
        content: `Request an organization on ${PRODUCT_NAME}. GPT-Lab reviews each request and sends a join link if approved.`,
      },
    ],
  }),
  component: RequestAccessPage,
});

function RequestAccessPage() {
  const { t } = useTranslation();
  const [organizationName, setOrganizationName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { submitPublicAccessRequest } = await import("@/lib/access-requests.functions");
      await submitPublicAccessRequest({
        data: {
          organizationName: organizationName.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          note: note.trim() || undefined,
        },
      });
      setSubmitted(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("requestPage.invalid"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-foreground">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <ProductMark />
        <PublicControls />
      </header>
      <div className="flex items-center justify-center p-6 min-h-[calc(100vh-4.25rem)]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              <h1>{t("requestPage.title")}</h1>
            </CardTitle>
            <CardDescription>{t("requestPage.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-4">
                <p className="text-sm font-medium">{t("requestPage.submittedTitle")}</p>
                <p className="text-sm text-muted-foreground">{t("requestPage.submittedBody")}</p>
                <Button asChild className="w-full">
                  <Link to="/auth" search={{ tab: "signin" }}>
                    {t("nav.signIn")}
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="org">{t("requestPage.orgName")}</Label>
                  <Input
                    id="org"
                    required
                    minLength={2}
                    maxLength={120}
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder={t("requestPage.orgNamePlaceholder")}
                    autoComplete="organization"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("requestPage.contactName")}</Label>
                  <Input
                    id="name"
                    required
                    maxLength={120}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t("requestPage.contactEmail")}</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note">{t("requestPage.note")}</Label>
                  <Textarea
                    id="note"
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("requestPage.notePlaceholder")}
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {t("requestPage.submit")}
                </Button>
              </form>
            )}
            <p className="text-xs text-muted-foreground text-center mt-6">
              <Link to="/auth" search={{ tab: "signin" }} className="hover:underline">
                {t("requestPage.signIn")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
