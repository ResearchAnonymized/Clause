import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

type Search = { token?: string };

export const Route = createFileRoute("/invite/accept")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [peek, setPeek] = useState<{
    ok: boolean;
    error?: string;
    email?: string;
    role?: string;
    orgName?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      const { peekInvite } = await import("@/lib/organizations.functions");
      const result = await peekInvite({ data: { token } });
      if (!cancelled) setPeek(result);
    })().catch((e) => {
      if (!cancelled) setPeek({ ok: false, error: String(e?.message ?? e) });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const accept = async () => {
    if (!token || !user) return;
    setBusy(true);
    try {
      const { acceptInvite } = await import("@/lib/organizations.functions");
      await acceptInvite({ data: { token } });
      toast.success("Joined organization");
      navigate({ to: "/dashboard", replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Could not accept invite");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invalid invite</CardTitle>
            <CardDescription>Missing invite token.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Organization invite
          </CardTitle>
          <CardDescription>
            {peek?.ok
              ? `You've been invited to ${peek.orgName} as ${peek.role}.`
              : peek?.error
                ? peek.error
                : "Loading invite…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {peek?.ok && (
            <p className="text-sm text-muted-foreground">
              Sign in as <span className="font-medium text-foreground">{peek.email}</span> to accept.
            </p>
          )}
          {!user && peek?.ok && (
            <Button asChild className="w-full">
              <Link to="/auth" search={{ redirect: `/invite/accept?token=${token}` } as any}>
                Sign in to accept
              </Link>
            </Button>
          )}
          {user && peek?.ok && (
            <Button className="w-full" onClick={accept} disabled={busy}>
              {busy ? "Joining…" : `Join ${peek.orgName}`}
            </Button>
          )}
          {user && peek?.ok && user.email?.toLowerCase() !== peek.email?.toLowerCase() && (
            <p className="text-xs text-destructive">
              You are signed in as {user.email}. Switch to {peek.email} to accept this invite.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
