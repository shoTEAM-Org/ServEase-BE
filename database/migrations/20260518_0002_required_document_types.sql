-- Create provider_catalog.required_document_types and seed standard KYC types.
-- Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS provider_catalog.required_document_types (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text        UNIQUE NOT NULL,
  label       text        NOT NULL,
  description text,
  is_required boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provider_catalog.required_document_types ENABLE ROW LEVEL SECURITY;

-- Authenticated users (providers) can read
DROP POLICY IF EXISTS authenticated_select ON provider_catalog.required_document_types;
CREATE POLICY authenticated_select ON provider_catalog.required_document_types
  FOR SELECT TO authenticated
  USING (true);

-- Service role has full access
DROP POLICY IF EXISTS service_role_all ON provider_catalog.required_document_types;
CREATE POLICY service_role_all ON provider_catalog.required_document_types
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed standard KYC document types
INSERT INTO provider_catalog.required_document_types (code, label, description, is_required, sort_order)
VALUES
  ('government_id',            'Government-Issued ID',     'Valid government ID (passport, driver''s license, or national ID)',                 true,  1),
  ('proof_of_address',         'Proof of Address',         'Utility bill, bank statement, or lease agreement (not older than 3 months)',        true,  2),
  ('business_permit',          'Business Permit',          'Valid DTI or SEC registration, or mayor''s permit',                                 false, 3),
  ('professional_certificate', 'Professional Certificate', 'Relevant professional license or certification for your service category',          false, 4)
ON CONFLICT (code) DO NOTHING;

COMMIT;
