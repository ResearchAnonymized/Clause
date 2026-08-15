-- OCR/AST columns, prompt version ledger, true LLM usage ledger.
-- Safe to re-run.

ALTER TABLE public.run_documents
  ADD COLUMN IF NOT EXISTS structure_json JSONB,
  ADD COLUMN IF NOT EXISTS ocr_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocr_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  version INT NOT NULL,
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, scope, scope_key, version)
);
CREATE INDEX IF NOT EXISTS prompt_versions_ws_scope_idx
  ON public.prompt_versions (workspace_id, scope, scope_key, version DESC);

CREATE TABLE IF NOT EXISTS public.llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.runs(id) ON DELETE CASCADE,
  agent_name TEXT,
  stage TEXT,
  model TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6),
  estimated BOOLEAN NOT NULL DEFAULT false,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_usage_run_idx ON public.llm_usage (run_id);
CREATE INDEX IF NOT EXISTS llm_usage_ws_idx ON public.llm_usage (workspace_id, created_at DESC);
