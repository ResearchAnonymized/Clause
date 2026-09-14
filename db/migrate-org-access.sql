-- Phase 1 user management: named invite workspaces + membership audit.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS workspace_role public.workspace_role;

CREATE TABLE IF NOT EXISTS public.organization_invite_workspaces (
  invite_id UUID NOT NULL REFERENCES public.organization_invites(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workspace_role public.workspace_role NOT NULL DEFAULT 'reviewer',
  PRIMARY KEY (invite_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS organization_invite_workspaces_ws_idx
  ON public.organization_invite_workspaces (workspace_id);

CREATE TABLE IF NOT EXISTS public.organization_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  event TEXT NOT NULL,
  target_email TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_audit_events_org_idx
  ON public.organization_audit_events (organization_id, created_at DESC);
