-- Invite can carry a platform-admin grant applied when the person creates an account.
ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS grant_platform_admin BOOLEAN NOT NULL DEFAULT false;
