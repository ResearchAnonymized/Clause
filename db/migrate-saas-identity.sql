-- Counterpart SaaS identity: auth tokens, events, dual criteria libraries.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT,
  purpose TEXT NOT NULL CHECK (purpose IN ('reset', 'verify')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON public.auth_tokens(user_id);
CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON public.auth_tokens(expires_at);

CREATE TABLE IF NOT EXISTS public.auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  email TEXT,
  event TEXT NOT NULL,
  ip TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_events_created_idx ON public.auth_events(created_at DESC);
CREATE INDEX IF NOT EXISTS auth_events_user_idx ON public.auth_events(user_id);

-- Existing Finnish public-procurement library is no longer the product default.
UPDATE public.criteria_sets
SET
  name = 'Finnish public procurement',
  description = 'Optional library shaped for Finnish public-procurement annexes (SLA, notice, DPA, pricing).',
  is_default = false
WHERE id = '00000000-0000-0000-0000-000000000001';

INSERT INTO public.criteria_sets (id, name, description, is_default)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Commercial contract review',
  'Default library for comparing a reference pack (tender, RFP, or contract) against a response pack (bid, MSA, or vendor draft).',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_default = EXCLUDED.is_default;

INSERT INTO public.criteria (set_id, name, category, description, prompt, model, severity_default, sort_order)
SELECT * FROM (VALUES
  ('00000000-0000-0000-0000-000000000002'::uuid, 'SLA existence', 'SLA',
   'Does the response commit to a service level for the offered service?',
   'You are a contract reviewer. Decide whether the RESPONSE pack states a service level (availability, support hours, or equivalent) for the service being bought. If MISSING return severity=critical. If PRESENT return severity=ok. Cite a short evidence quote from this pack.',
   'gpt-4o-mini', 'critical', 1),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'SLA level comparison', 'SLA',
   'Does the offered service level meet the reference requirement?',
   'Compare the service level required in the REFERENCE pack with the level offered in the RESPONSE pack (availability %, severity response times, credits). Return severity=critical if the offer is weaker, warning if comparable but incomplete, ok if it meets or exceeds. Cite both sides.',
   'gpt-4o-mini', 'critical', 2),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'Notice period alignment', 'Termination',
   'Can the buyer exit on terms that match what they promised downstream?',
   'Extract termination / notice periods from REFERENCE and RESPONSE. Return severity=critical if the supplier notice is longer than the buyer can give their own customer, warning if they differ with limited exposure, ok if they align.',
   'gpt-4o-mini', 'critical', 3),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'DPA appendix presence', 'DPA',
   'Is personal-data processing covered by a DPA or equivalent annex?',
   'Check whether the packs include a data processing agreement or equivalent description of personal-data processing for the service. Return severity=critical if missing, warning if present but incomplete, ok if covered. Cite this pack.',
   'gpt-4o-mini', 'critical', 4),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'Pricing appendix presence', 'Pricing',
   'Is there a clear price schedule for the offered service?',
   'Check the RESPONSE pack for a pricing table, rate card, or commercial appendix covering the service. Return severity=critical if pricing cannot be identified, warning if present but incomplete, ok if a schedule exists. Cite this pack.',
   'gpt-4o-mini', 'critical', 5),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'Price adjustment mechanism', 'Pricing',
   'Can the supplier raise prices under terms the buyer cannot recover?',
   'Compare price-adjustment terms in REFERENCE and RESPONSE. Return severity=critical if the supplier can raise prices under conditions the buyer cannot pass on, warning if mechanisms differ with limited exposure, ok if they mirror.',
   'gpt-4o-mini', 'warning', 6),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'Information security baseline', 'Infosec',
   'Do security commitments meet the reference baseline?',
   'Assess information-security commitments (certifications, encryption, incident notification, sub-processor disclosure) in the RESPONSE against the REFERENCE minimum. Return severity=critical for missing mandatory controls, warning for weak commitments, ok for alignment. Cite this pack.',
   'gpt-4o-mini', 'critical', 7)
) AS v(set_id, name, category, description, prompt, model, severity_default, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.criteria c WHERE c.set_id = '00000000-0000-0000-0000-000000000002'
);
