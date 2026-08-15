import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) return { user: data.user };
    } catch {
      // In standalone preview, the auth validation request can be interrupted even
      // when a freshly signed-in session has already been stored locally.
      // Server functions still validate the bearer token; this only keeps the UI gate renderable.
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) return { user: sessionData.session.user };
    } catch {
      // If local session hydration fails, redirect cleanly instead of rendering
      // the app-wide error boundary.
    }

    throw redirect({ to: "/auth" });
  },
  component: LayoutComponent,
});

function LayoutComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
