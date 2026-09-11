-- Clause local Postgres schema (Supabase-free)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE public.app_role AS ENUM ('admin', 'reviewer', 'viewer');
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'reviewer', 'viewer');
CREATE TYPE public.organization_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.run_status AS ENUM ('queued', 'running', 'completed', 'failed');

CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  full_name TEXT,
  avatar_url TEXT,
  email_verified_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON public.sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON public.sessions(expires_at);

CREATE TABLE public.auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('reset', 'verify')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_tokens_user_idx ON public.auth_tokens(user_id);

CREATE TABLE public.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email TEXT,
  event TEXT NOT NULL,
  ip TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_events_created_idx ON public.auth_events(created_at DESC);

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'personal' CHECK (kind IN ('personal', 'company')),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organizations_slug_idx ON public.organizations (slug);

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role organization_role NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_members_user_idx ON public.organization_members (user_id);
CREATE INDEX organization_members_org_idx ON public.organization_members (organization_id);

CREATE TABLE public.organization_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role organization_role NOT NULL DEFAULT 'member',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organization_invites_org_idx ON public.organization_invites (organization_id);

CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  llm_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  agent_prompts JSONB NOT NULL DEFAULT '{}'::jsonb,
  slack_webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX workspaces_organization_id_idx ON public.workspaces (organization_id);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  current_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  current_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  onboarding_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role workspace_role NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id)
);

CREATE TABLE public.criteria_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES public.criteria_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  severity_default TEXT NOT NULL DEFAULT 'medium',
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  prompt_variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_variant_index INT NOT NULL DEFAULT 0,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  status run_status NOT NULL DEFAULT 'queued',
  criteria_set_id UUID REFERENCES public.criteria_sets(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  critical_count INT NOT NULL DEFAULT 0,
  warning_count INT NOT NULL DEFAULT 0,
  ok_count INT NOT NULL DEFAULT 0,
  summary TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewer_name TEXT,
  reviewer_title TEXT,
  signature_statement TEXT,
  auditor_ref TEXT,
  review_frequency TEXT,
  token_usage JSONB,
  worker_version TEXT,
  -- Pack archive summary (for Analyses history without joining documents)
  customer_pack_label TEXT,
  supplier_pack_label TEXT,
  customer_doc_count INT DEFAULT 0,
  supplier_doc_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Original uploaded ZIP / pack files kept for audit & re-download
CREATE TABLE public.run_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'supplier')),
  pack_label TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  file_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX run_packs_run_idx ON public.run_packs (run_id);

CREATE TABLE public.run_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  extracted_text TEXT,
  parsed_text TEXT,
  parsed_at TIMESTAMPTZ,
  extractor_version INT,
  num_chunks INT,
  -- Pack / ZIP metadata (EU tender-style multi-file responses)
  source_path TEXT,
  pack_label TEXT,
  doc_kind TEXT,
  sort_order INT DEFAULT 0,
  -- Clause AST + OCR metadata
  structure_json JSONB,
  ocr_used BOOLEAN NOT NULL DEFAULT false,
  ocr_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  criterion_id UUID REFERENCES public.criteria(id) ON DELETE SET NULL,
  criterion_name TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  clause_ref TEXT,
  justification TEXT NOT NULL,
  recommended_action TEXT,
  confidence NUMERIC,
  agent_name TEXT,
  model TEXT,
  evidence_chunk_ids UUID[] DEFAULT '{}'::uuid[],
  evidence_quote TEXT,
  retrieval_debug JSONB DEFAULT '{}'::jsonb,
  grounded BOOLEAN DEFAULT false,
  analyzer_version INT,
  chunker_version INT,
  extractor_version INT,
  prompt_variant INT,
  produced_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES public.findings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  criterion_id UUID REFERENCES public.criteria(id) ON DELETE SET NULL,
  criterion_name TEXT NOT NULL,
  category TEXT,
  ord INT NOT NULL DEFAULT 0,
  agent_answer TEXT NOT NULL DEFAULT 'na',
  agent_severity TEXT,
  agent_confidence NUMERIC,
  agent_evidence TEXT,
  agent_justification TEXT,
  agent_recommended_action TEXT,
  evidence_chunk_ids UUID[] DEFAULT '{}'::uuid[],
  retrieval_debug JSONB DEFAULT '{}'::jsonb,
  grounded BOOLEAN DEFAULT false,
  clause_ref TEXT,
  flagged BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_answer TEXT,
  reviewer_comment TEXT,
  reviewer_evidence_override TEXT,
  reviewer_severity TEXT,
  analyzer_version INT,
  chunker_version INT,
  extractor_version INT,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.doc_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.run_documents(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'supplier')),
  ord INT NOT NULL,
  text TEXT NOT NULL,
  token_count INT,
  embedding vector(1536),
  chunker_version INT,
  extractor_version INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX doc_chunks_run_role_idx ON public.doc_chunks (run_id, role, ord);
CREATE INDEX doc_chunks_document_idx ON public.doc_chunks (document_id);
CREATE INDEX doc_chunks_embedding_idx ON public.doc_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  rationale TEXT,
  required_approvals INT NOT NULL DEFAULT 1,
  source_docs_sha256 TEXT,
  report_sha256 TEXT,
  doc_sha256 TEXT,
  signer_ip TEXT,
  signer_user_agent TEXT,
  finalised_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.decision_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  approver_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approver_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reviewer',
  signature TEXT NOT NULL,
  comment TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.negotiation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  finding_id UUID REFERENCES public.findings(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ask TEXT NOT NULL,
  category TEXT,
  criterion_name TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  view_count INT NOT NULL DEFAULT 0,
  max_views INT,
  last_viewed_at TIMESTAMPTZ,
  last_viewer_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.analysis_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  criteria_set_id UUID NOT NULL REFERENCES public.criteria_sets(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cadence TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'error',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.rate_limits (
  bucket TEXT NOT NULL,
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, key, window_start)
);
CREATE INDEX rate_limits_window_idx ON public.rate_limits (window_start);

CREATE OR REPLACE FUNCTION public.tg_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER organization_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER workspace_members_updated_at BEFORE UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER criteria_sets_updated_at BEFORE UPDATE ON public.criteria_sets FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER criteria_updated_at BEFORE UPDATE ON public.criteria FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER runs_updated_at BEFORE UPDATE ON public.runs FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER decisions_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER negotiation_items_updated_at BEFORE UPDATE ON public.negotiation_items FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER analysis_schedules_updated_at BEFORE UPDATE ON public.analysis_schedules FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER audit_checklist_items_updated_at BEFORE UPDATE ON public.audit_checklist_items FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles workspace_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = ANY(_roles)
  )
$$;

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
  _roles organization_role[]
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

CREATE OR REPLACE FUNCTION public.match_doc_chunks(
  _run_id UUID,
  _role TEXT,
  _query_embedding vector(1536),
  _match_count INT DEFAULT 6
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  ord INT,
  text TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    d.id,
    d.document_id,
    d.ord,
    d.text,
    1 - (d.embedding <=> _query_embedding) AS similarity
  FROM public.doc_chunks d
  WHERE d.run_id = _run_id
    AND d.role = _role
    AND d.embedding IS NOT NULL
  ORDER BY d.embedding <=> _query_embedding
  LIMIT _match_count;
$$;

CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket TEXT, _key TEXT, _limit INT, _window_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  _bucket_start TIMESTAMPTZ;
  _current INT;
BEGIN
  _bucket_start := to_timestamp((floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds));
  INSERT INTO public.rate_limits (bucket, key, window_start, count)
  VALUES (_bucket, _key, _bucket_start, 1)
  ON CONFLICT (bucket, key, window_start) DO UPDATE
    SET count = public.rate_limits.count + 1
  RETURNING count INTO _current;
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN _current <= _limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_decision_hash(_hash text)
RETURNS TABLE(verdict text, signed_at timestamptz, signer_role text, signer_name text)
LANGUAGE sql STABLE AS $$
  SELECT
    d.verdict,
    d.finalised_at AS signed_at,
    (SELECT a.role FROM public.decision_approvals a
       WHERE a.decision_id = d.id ORDER BY a.signed_at ASC LIMIT 1) AS signer_role,
    (SELECT a.approver_name FROM public.decision_approvals a
       WHERE a.decision_id = d.id ORDER BY a.signed_at ASC LIMIT 1) AS signer_name
  FROM public.decisions d
  WHERE d.status = 'signed'
    AND (
      d.source_docs_sha256 = lower(_hash)
      OR d.report_sha256 = lower(_hash)
      OR d.doc_sha256 = lower(_hash)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.reap_stuck_runs()
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  UPDATE public.runs
  SET status = 'failed',
      completed_at = now(),
      summary = COALESCE(summary, '') || ' (reaped: stuck running)'
  WHERE status = 'running'
    AND started_at < now() - interval '2 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Clause mapping pairs (semantic customer ↔ supplier alignment)
CREATE TABLE IF NOT EXISTS public.run_clause_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  customer_excerpt TEXT,
  supplier_excerpt TEXT,
  note TEXT,
  confidence NUMERIC,
  sort_order INT NOT NULL DEFAULT 0,
  derived_status TEXT,
  similarity NUMERIC,
  similarity_method TEXT,
  auth_grade TEXT,
  override_status TEXT,
  override_reason TEXT,
  override_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  override_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS run_clause_pairs_run_idx ON public.run_clause_pairs (run_id);

CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_templates_workspace_idx ON public.report_templates (workspace_id);

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS recommendation_json JSONB,
  ADD COLUMN IF NOT EXISTS pipeline_flags JSONB DEFAULT '{}'::jsonb;

-- Prompt content version ledger (append-only)
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

-- True LLM token / cost ledger (per call)
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

ALTER TABLE public.run_documents
  ADD COLUMN IF NOT EXISTS structure_json JSONB,
  ADD COLUMN IF NOT EXISTS ocr_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ocr_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

