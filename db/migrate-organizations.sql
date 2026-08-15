-- SaaS organizations (tenants) + invites. Safe to re-run.

DO $$ BEGIN
  CREATE TYPE public.organization_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'personal'
    CHECK (kind IN ('personal', 'company')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organizations_slug_idx ON public.organizations (slug);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.organization_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS organization_members_org_idx
  ON public.organization_members (organization_id);

CREATE TABLE IF NOT EXISTS public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.organization_role NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS organization_invites_org_idx
  ON public.organization_invites (organization_id);
CREATE INDEX IF NOT EXISTS organization_invites_email_idx
  ON public.organization_invites (lower(email));

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS workspaces_organization_id_idx
  ON public.workspaces (organization_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Backfill: one personal org per existing workspace owner, attach workspace, seed memberships
DO $$
DECLARE
  ws RECORD;
  org_id UUID;
  slug_base TEXT;
  org_slug TEXT;
  mem RECORD;
BEGIN
  FOR ws IN
    SELECT w.* FROM public.workspaces w
    WHERE w.organization_id IS NULL
  LOOP
    slug_base := lower(regexp_replace(coalesce(ws.name, 'org'), '[^a-z0-9]+', '-', 'g'));
    slug_base := trim(both '-' from slug_base);
    IF slug_base = '' THEN slug_base := 'org'; END IF;
    org_slug := slug_base || '-org-' || substr(ws.id::text, 1, 8);

    INSERT INTO public.organizations (name, slug, kind, created_by)
    VALUES (
      CASE
        WHEN ws.name ILIKE '%workspace' THEN regexp_replace(ws.name, '\s*workspace\s*$', '', 'i')
        ELSE ws.name
      END,
      org_slug,
      'personal',
      ws.owner_id
    )
    RETURNING id INTO org_id;

    UPDATE public.workspaces SET organization_id = org_id WHERE id = ws.id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (org_id, ws.owner_id, 'owner')
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    FOR mem IN
      SELECT user_id, role FROM public.workspace_members WHERE workspace_id = ws.id
    LOOP
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (
        org_id,
        mem.user_id,
        CASE
          WHEN mem.user_id = ws.owner_id THEN 'owner'::public.organization_role
          WHEN mem.role IN ('owner', 'admin') THEN 'admin'::public.organization_role
          ELSE 'member'::public.organization_role
        END
      )
      ON CONFLICT (organization_id, user_id) DO NOTHING;
    END LOOP;

    UPDATE public.profiles p
    SET current_organization_id = org_id
    WHERE p.current_workspace_id = ws.id
      AND p.current_organization_id IS NULL;
  END LOOP;

  -- Any profile still missing org: use first membership
  UPDATE public.profiles p
  SET current_organization_id = m.organization_id
  FROM public.organization_members m
  WHERE p.id = m.user_id
    AND p.current_organization_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.is_organization_member(_organization_id uuid, _user_id uuid)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _organization_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_organization_role(
  _organization_id uuid,
  _user_id uuid,
  _roles public.organization_role[]
)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _organization_id
      AND user_id = _user_id
      AND role = ANY(_roles)
  )
$$;
