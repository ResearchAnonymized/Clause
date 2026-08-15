-- Phase E: decision-ready mapping — persisted scores + human overrides
-- Safe to re-run.

ALTER TABLE public.run_clause_pairs
  ADD COLUMN IF NOT EXISTS derived_status TEXT,
  ADD COLUMN IF NOT EXISTS similarity NUMERIC,
  ADD COLUMN IF NOT EXISTS similarity_method TEXT,
  ADD COLUMN IF NOT EXISTS auth_grade TEXT,
  ADD COLUMN IF NOT EXISTS override_status TEXT,
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS run_clause_pairs_status_idx
  ON public.run_clause_pairs (run_id, COALESCE(override_status, derived_status));
