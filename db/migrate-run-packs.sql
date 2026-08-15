-- Case history: pack summaries on runs + original ZIP archive rows
ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS customer_pack_label TEXT,
  ADD COLUMN IF NOT EXISTS supplier_pack_label TEXT,
  ADD COLUMN IF NOT EXISTS customer_doc_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_doc_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.run_packs (
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
CREATE INDEX IF NOT EXISTS run_packs_run_idx ON public.run_packs (run_id);
