-- Default criteria library (workspace-agnostic seed)
INSERT INTO public.criteria_sets (id, name, description, is_default)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Welfare Region Default',
  'Baseline criteria derived from 2M-IT test cases (SLA, notice, DPA, pricing).',
  true
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
