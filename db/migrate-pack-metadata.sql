-- Pack / ZIP metadata for multi-file tender responses
ALTER TABLE public.run_documents
  ADD COLUMN IF NOT EXISTS source_path TEXT,
  ADD COLUMN IF NOT EXISTS pack_label TEXT,
  ADD COLUMN IF NOT EXISTS doc_kind TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
