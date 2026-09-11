-- Per-user getting-started progress (checklist + coach). Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_json JSONB NOT NULL DEFAULT '{}'::jsonb;
