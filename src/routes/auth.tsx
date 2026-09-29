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
import { PRODUCT_NAME } from "@/config/instance";
import { ProductMark } from "@/components/product-mark";
import { PublicControls } from "@/components/public-controls";
import { parseInviteInput } from "@/lib/organizations";

type Search = { invite?: string; tab?: "signin" | "signup" };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
    tab: search.tab === "signup" || search.tab === "signin" ? search.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: `Sign in — ${PRODUCT_NAME}` },
      { name: "description", content: `Sign in to the ${PRODUCT_NAME} workspace.` },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { invite, tab: tabFromUrl } = Route.useSearch();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState<"personal" | "company">("personal");
  const [orgName, setOrgName] = useState("");
  const [inviteToken, setInviteToken] = useState(parseInviteInput(invite ?? ""));
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [showInviteField, setShowInviteField] = useState(false);
  const [access, setAccess] = useState<{
    bootstrap: boolean;
    canSignUp: boolean;
    inviteRequired: boolean;
    signupOff: boolean;
  } | null>(null);
  const [canMail, setCanMail] = useState<boolean | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [tab, setTab] = useState(invite || tabFromUrl === "signup" ? "signup" : "signin");

  useEffect(() => {
    let cancelled = false;
    setMounted(true);
    fetch("/api/auth", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setAccess(json.access ?? null);
          setCanMail(typeof json.mailConfigured === "boolean" ? json.mailConfigured : null);
        }
      })
      .catch(() => undefined);

    supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (!cancelled && !error && data.user) {
          navigate({ to: "/dashboard", replace: true });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!inviteToken) return;
    const token = parseInviteInput(inviteToken);
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { peekInvite } = await import("@/lib/organizations.functions");
      const result = await peekInvite({ data: { token } });
      if (!cancelled && result.ok) {
        setInviteEmail(result.email);
        setEmail(result.email);
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const showSignup = Boolean(access?.canSignUp || access?.inviteRequired || inviteToken) || access === null;

  useEffect(() => {
    if (access?.signupOff && !inviteToken) setTab("signin");
    else if (inviteToken || access?.bootstrap) setTab("signup");
  }, [access?.signupOff, access?.bootstrap, inviteToken]);

  if (!mounted) return <div className="min-h-screen bg-paper" />;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return toast.error(error.message);
      toast.success(t("auth.signedIn"));
      if (inviteToken) navigate({ to: "/invite/accept", search: { token: inviteToken }, replace: true });
      else navigate({ to: "/dashboard", replace: true });
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
          data: {
            full_name: name,
            organization_kind: inviteToken ? undefined : accountType,
            organization_name: inviteToken ? undefined : accountType === "company" ? orgName.trim() || name : undefined,
            invite_token: parseInviteInput(inviteToken) || undefined,
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
      toast.error(error instanceof Error ? error.message : t("auth.signUpFailed"));
    } finally {
      setBusy(false);
    }
  };

  const requestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "requestReset", email }),
      });
      const json = await res.json();
      if (json.error) return toast.error(json.error.message);
      setResetSent(true);
      toast.success(json.mailed ? t("auth.resetSent") : t("auth.resetNoMail"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-paper text-foreground">
      <div className="hidden lg:flex flex-col justify-between bg-stage text-stage-foreground p-12">
        <ProductMark inverted />
        <div className="space-y-6 max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight">{t("auth.heroTitle")}</h1>
          <p className="text-white/75 text-lg">{t("auth.heroLead")}</p>
          <div className="flex items-center gap-2 text-sm text-white/60">
            <ShieldCheck className="w-4 h-4 text-white" /> {t("auth.heroTrust")}
          </div>
        </div>
        <div className="text-xs text-white/45">© {new Date().getFullYear()} {PRODUCT_NAME}</div>
      </div>

      <div className="flex flex-col bg-paper">
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="lg:hidden">
            <ProductMark />
          </div>
          <div className="ml-auto">
            <PublicControls />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t("auth.cardTitle")}</CardTitle>
            <CardDescription>{t("auth.cardDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {resetMode ? (
              <form onSubmit={requestReset} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">{t("auth.email")}</Label>
                  <Input id="reset-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {canMail === false && (
                  <p className="text-xs text-muted-foreground">{t("auth.resetUnavailable")}</p>
                )}
                <Button type="submit" className="w-full" disabled={busy || canMail === false}>
                  {t("auth.sendReset")}
                </Button>
                {resetSent && (
                  <p className="text-xs text-muted-foreground">
                    {canMail ? t("auth.resetSent") : t("auth.resetNoMail")}
                  </p>
                )}
                <button type="button" className="text-xs text-muted-foreground hover:underline w-full" onClick={() => setResetMode(false)}>
                  {t("auth.signIn")}
                </button>
              </form>
            ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className={`grid w-full ${showSignup ? "grid-cols-2" : "grid-cols-1"}`}>
                <TabsTrigger value="signin">{t("auth.signIn")}</TabsTrigger>
                {showSignup && <TabsTrigger value="signup">{t("auth.signUp")}</TabsTrigger>}
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
                  <Button type="submit" className="w-full" disabled={busy}>{t("auth.signIn")}</Button>
                  <button type="button" className="text-xs text-muted-foreground hover:underline w-full" onClick={() => setResetMode(true)}>
                    {t("auth.forgotPassword")}
                  </button>
                </form>
              </TabsContent>
              {showSignup && (
              <TabsContent value="signup">
                <form onSubmit={signUp} className="space-y-3 mt-4">
                  {(access?.inviteRequired || inviteToken) && !access?.bootstrap && (
                    <p className="text-xs text-muted-foreground">{t("auth.inviteOnly")}</p>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email2">{t("auth.email")}</Label>
                    <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    {inviteEmail && <p className="text-[11px] text-muted-foreground">{t("auth.inviteFor", { email: inviteEmail })}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("auth.fullName")}</Label>
                    <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  {access?.bootstrap && !inviteToken && (
                    <>
                      <div className="space-y-1.5">
                        <Label>{t("auth.accountType")}</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" variant={accountType === "personal" ? "default" : "outline"} onClick={() => setAccountType("personal")}>{t("auth.personal")}</Button>
                          <Button type="button" variant={accountType === "company" ? "default" : "outline"} onClick={() => setAccountType("company")}>{t("auth.organization")}</Button>
                        </div>
                      </div>
                      {accountType === "company" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="orgName">{t("auth.orgName")}</Label>
                          <Input id="orgName" required value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                        </div>
                      )}
                    </>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="password2">{t("auth.password")}</Label>
                    <Input id="password2" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground">{t("auth.passwordHint")}</p>
                  </div>
                  {(access?.inviteRequired || access?.signupOff || inviteToken) && !access?.bootstrap && (
                    showInviteField ? (
                      <div className="space-y-1.5">
                        <Label htmlFor="invite">{t("auth.inviteToken")}</Label>
                        <Input
                          id="invite"
                          value={inviteToken}
                          onChange={(e) => setInviteToken(e.target.value)}
                          placeholder={t("auth.invitePlaceholder")}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <p className="text-[11px] text-muted-foreground">{t("auth.inviteHint")}</p>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:underline"
                        onClick={() => setShowInviteField(true)}
                      >
                        {t("auth.inviteLinkToggle")}
                      </button>
                    )
                  )}
                  <Button type="submit" className="w-full" disabled={busy}>{t("auth.createAccount")}</Button>
                  {access?.bootstrap ? (
                    <p className="text-xs text-muted-foreground text-center">{t("auth.firstAdmin")}</p>
                  ) : access?.inviteRequired ? (
                    <p className="text-xs text-muted-foreground text-center">
                      <Link to="/request" className="hover:underline">{t("auth.requestAccessHint")}</Link>
                    </p>
                  ) : null}
                </form>
              </TabsContent>
              )}
            </Tabs>
            )}
            {access?.signupOff && !inviteToken && (
              <p className="text-xs text-muted-foreground text-center mt-4">{t("auth.inviteOnly")}</p>
            )}
            <p className="text-xs text-muted-foreground text-center mt-6">
              <Link to="/" className="hover:underline">{t("auth.backHome")}</Link>
            </p>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
