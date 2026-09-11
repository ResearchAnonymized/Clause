-- Default criteria libraries (workspace-agnostic seed)
INSERT INTO public.criteria_sets (id, name, description, is_default)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  'Commercial contract review',
  'Default library for comparing a reference pack (tender, RFP, or contract) against a response pack (bid, MSA, or vendor draft).',
  true
);

INSERT INTO public.criteria_sets (id, name, description, is_default)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Finnish public procurement',
  'Optional library shaped for Finnish public-procurement annexes (SLA, notice, DPA, pricing).',
  false
);

INSERT INTO public.criteria (set_id, name, category, description, prompt, model, severity_default, sort_order) VALUES
('00000000-0000-0000-0000-000000000001', 'SLA existence', 'SLA',
 'Case 1: Is the service listed in the customer agreement Appendix 1.1 Service and Information System Map?',
 'You are a contract auditor. Read the CUSTOMER contract (Appendix 1.1 Service and Information System Map). Determine if the target service is present. If MISSING return severity=critical with a short justification. If PRESENT return severity=ok with "SLA reference exists".',
 'gpt-4o-mini', 'critical', 1),
('00000000-0000-0000-0000-000000000001', 'SLA level comparison', 'SLA',
 'Case 2: Customer Appendix 1.1 vs Supplier Appendix 5 Service Levels. Any mismatch = critical.',
 'Compare the SLA service level in the CUSTOMER Appendix 1.1 (e.g. V1/V2) against the SUPPLIER Appendix 5 Service Levels. Return severity=critical if the two levels differ (either direction) with a justification naming both levels and the cost or service exposure. Return severity=ok only if they match exactly.',
 'gpt-4o-mini', 'critical', 2),
('00000000-0000-0000-0000-000000000001', 'Notice period alignment', 'Termination',
 'Case 3: Customer Appendix 2 Special Terms vs Supplier Main Agreement notice period. Default 12 months if missing.',
 'Extract the notice period the ORGANISATION has promised the CUSTOMER (Appendix 2 Special Terms; default 12 months if absent) and the notice period the SUPPLIER grants in the Main Agreement. Return severity=critical if the supplier notice period is LONGER than the customer notice period (we stay liable). Return severity=warning if the customer notice period is longer than the supplier notice period (revenue leak). Return severity=ok if they match.',
 'gpt-4o-mini', 'critical', 3),
('00000000-0000-0000-0000-000000000001', 'DPA appendix presence', 'DPA',
 'Case 4: Is the system listed in Appendix 1.2.X Description of Personal Data Processing Activities?',
 'Check the CUSTOMER agreement for Appendix 1.2.X Description of Personal Data Processing Activities for the target system. Return severity=critical if the system is MISSING with a note that a DPA gap exists. Return severity=ok if present.',
 'gpt-4o-mini', 'critical', 4),
('00000000-0000-0000-0000-000000000001', 'Pricing appendix presence', 'Pricing',
 'Case 5: Is the system listed in Appendix 5 Service-Specific Pricing (Excel)?',
 'Check the CUSTOMER agreement Appendix 5 Service-Specific Pricing (Excel) for the target system. Return severity=critical if the system is MISSING (cannot bill the customer) with a note. Return severity=ok if present.',
 'gpt-4o-mini', 'critical', 5),
('00000000-0000-0000-0000-000000000001', 'Price adjustment mechanism', 'Pricing',
 'Are price-adjustment triggers (index, licence cost changes) mirrored on both sides?',
 'Compare price-adjustment terms in the CUSTOMER contract and the SUPPLIER contract. Return severity=critical if the supplier can raise prices under conditions the organisation cannot pass on to the customer. Return severity=warning if mechanisms differ but exposure is limited. Return severity=ok if they mirror.',
 'gpt-4o-mini', 'warning', 6),
('00000000-0000-0000-0000-000000000001', 'Information security baseline', 'Infosec',
 'Do supplier terms meet the customer/organisation infosec baseline?',
 'Assess the supplier''s information-security commitments (ISO 27001, SOC 2, encryption, incident notification timelines, sub-processor disclosure) against the customer contract''s minimum requirements. Return severity=critical for missing mandatory controls, warning for weak commitments, ok for full alignment.',
 'gpt-4o-mini', 'critical', 7);

INSERT INTO public.criteria (set_id, name, category, description, prompt, model, severity_default, sort_order) VALUES
('00000000-0000-0000-0000-000000000002', 'SLA existence', 'SLA',
 'Does the response commit to a service level for the offered service?',
 'You are a contract reviewer. Decide whether the RESPONSE pack states a service level (availability, support hours, or equivalent) for the service being bought. If MISSING return severity=critical. If PRESENT return severity=ok. Cite a short evidence quote from this pack.',
 'gpt-4o-mini', 'critical', 1),
('00000000-0000-0000-0000-000000000002', 'SLA level comparison', 'SLA',
 'Does the offered service level meet the reference requirement?',
 'Compare the service level required in the REFERENCE pack with the level offered in the RESPONSE pack (availability %, severity response times, credits). Return severity=critical if the offer is weaker, warning if comparable but incomplete, ok if it meets or exceeds. Cite both sides.',
 'gpt-4o-mini', 'critical', 2),
('00000000-0000-0000-0000-000000000002', 'Notice period alignment', 'Termination',
 'Can the buyer exit on terms that match what they promised downstream?',
 'Extract termination / notice periods from REFERENCE and RESPONSE. Return severity=critical if the supplier notice is longer than the buyer can give their own customer, warning if they differ with limited exposure, ok if they align.',
 'gpt-4o-mini', 'critical', 3),
('00000000-0000-0000-0000-000000000002', 'DPA appendix presence', 'DPA',
 'Is personal-data processing covered by a DPA or equivalent annex?',
 'Check whether the packs include a data processing agreement or equivalent description of personal-data processing for the service. Return severity=critical if missing, warning if present but incomplete, ok if covered. Cite this pack.',
 'gpt-4o-mini', 'critical', 4),
('00000000-0000-0000-0000-000000000002', 'Pricing appendix presence', 'Pricing',
 'Is there a clear price schedule for the offered service?',
 'Check the RESPONSE pack for a pricing table, rate card, or commercial appendix covering the service. Return severity=critical if pricing cannot be identified, warning if present but incomplete, ok if a schedule exists. Cite this pack.',
 'gpt-4o-mini', 'critical', 5),
('00000000-0000-0000-0000-000000000002', 'Price adjustment mechanism', 'Pricing',
 'Can the supplier raise prices under terms the buyer cannot recover?',
 'Compare price-adjustment terms in REFERENCE and RESPONSE. Return severity=critical if the supplier can raise prices under conditions the buyer cannot pass on, warning if mechanisms differ with limited exposure, ok if they mirror.',
 'gpt-4o-mini', 'warning', 6),
('00000000-0000-0000-0000-000000000002', 'Information security baseline', 'Infosec',
 'Do security commitments meet the reference baseline?',
 'Assess information-security commitments (certifications, encryption, incident notification, sub-processor disclosure) in the RESPONSE against the REFERENCE minimum. Return severity=critical for missing mandatory controls, warning for weak commitments, ok for alignment. Cite this pack.',
 'gpt-4o-mini', 'critical', 7);
