import { useState, useEffect } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Clause" },
      { name: "description", content: "Sign in to the Clause contract intelligence workspace." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState<"personal" | "company">("personal");
  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    let cancelled = false;
    setMounted(true);

    supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (!cancelled && !error && data.user) {
          navigate({ to: "/dashboard", replace: true });
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!cancelled && sessionData.session?.user) navigate({ to: "/dashboard", replace: true });
      })
      .catch(() => {
        // Standalone preview builds can block/interrupt auth session refreshes.
        // Keep the public sign-in screen renderable instead of surfacing a route error.
      });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!mounted) {
    return <div className="min-h-screen bg-background" />;
  }

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return toast.error(error.message);
      toast.success(t("auth.signedIn"));
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.googleFailed"));
    } finally {
      setBusy(false);
    }

  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: name,
            organization_kind: accountType,
            organization_name: accountType === "company" ? orgName.trim() || name : undefined,
          },
        },
      });
      if (error) return toast.error(error.message);
      if (data.session) {
        toast.success(t("auth.accountCreated"));
        navigate({ to: "/dashboard", replace: true });
      } else {
        toast.success(t("auth.accountCreatedCheck"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.googleFailed"));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    try {
      const { lovable } = await import("@/integrations/lovable");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) toast.error(result.error.message ?? t("auth.googleFailed"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("auth.googleFailed"));
    }
  };


  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-12">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <div className="w-8 h-8 rounded bg-sidebar-primary text-sidebar-primary-foreground grid place-items-center font-bold">C</div>
          Clause
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">{t("auth.heroTitle")}</h1>
          <p className="text-sidebar-foreground/70 text-lg">
            {t("auth.heroLead")}
          </p>
          <div className="flex items-center gap-2 text-sm text-sidebar-foreground/60">
            <ShieldCheck className="w-4 h-4" /> {t("auth.heroTrust")}
          </div>
        </div>
        <div className="text-xs text-sidebar-foreground/50">© {new Date().getFullYear()} Clause</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("auth.cardTitle")}</CardTitle>
            <CardDescription>{t("auth.cardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full mb-4" onClick={google}>
              {t("auth.google")}
            </Button>
            <div className="relative my-4 text-center text-xs text-muted-foreground">
              <span className="bg-card px-2 relative z-10">{t("auth.or")}</span>
              <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            </div>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                <form onSubmit={signIn} className="space-y-3 mt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                    <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {t("auth.signIn")}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-3 mt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("auth.fullName")}</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Account type</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={accountType === "personal" ? "default" : "outline"}
                        onClick={() => setAccountType("personal")}
                      >
                        Personal
                      </Button>
                      <Button
                        type="button"
                        variant={accountType === "company" ? "default" : "outline"}
                        onClick={() => setAccountType("company")}
                      >
                        Organization
                      </Button>
                    </div>
                  </div>
                  {accountType === "company" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="orgName">Organization name</Label>
                      <Input
                        id="orgName"
                        required
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="Acme Procurement"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email2">{t("auth.email")}</Label>
                    <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password2">{t("auth.password")}</Label>
                    <Input id="password2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {t("auth.createAccount")}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    {accountType === "company"
                      ? "You'll be the organization owner and can invite teammates."
                      : t("auth.firstAdmin")}
                  </p>
                </form>
              </TabsContent>
            </Tabs>
            <p className="text-xs text-muted-foreground text-center mt-6">
              <Link to="/" className="hover:underline">{t("auth.backHome")}</Link>
            </p>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
