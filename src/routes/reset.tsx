import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { PRODUCT_NAME } from "@/config/instance";
import { ProductMark } from "@/components/product-mark";
import { PublicControls } from "@/components/public-controls";

type Search = { token?: string };

export const Route = createFileRoute("/reset")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  head: () => ({ meta: [{ title: `Reset password — ${PRODUCT_NAME}` }] }),
  component: ResetPage,
});

function ResetPage() {
  const { t } = useTranslation();
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirmReset", resetToken: token, password }),
      });
      const json = await res.json();
      if (json.error) return toast.error(json.error.message);
      toast.success(t("auth.passwordUpdated"));
      navigate({ to: "/auth", replace: true });
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
          <CardTitle>{t("auth.setNewPassword")}</CardTitle>
          <CardDescription>{t("auth.setNewPasswordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="text-sm text-muted-foreground">{t("auth.missingResetToken")}</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pw">{t("auth.newPassword")}</Label>
                <Input id="pw" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">{t("auth.passwordHint")}</p>
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{t("auth.updatePassword")}</Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground text-center mt-6">
            <Link to="/auth" className="hover:underline">{t("auth.backHome")}</Link>
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
