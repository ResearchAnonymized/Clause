-- Public organization access requests. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  ip TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_requests_status_idx
  ON public.access_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS access_requests_email_idx
  ON public.access_requests (lower(contact_email));
