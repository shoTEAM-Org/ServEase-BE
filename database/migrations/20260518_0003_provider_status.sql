-- Create provider_catalog.provider_status for the /status/direct gateway endpoint.
-- Idempotent — safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS provider_catalog.provider_status (
  provider_id  uuid        PRIMARY KEY,
  status       text        NOT NULL DEFAULT 'offline',
  last_updated timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_status_status_check
    CHECK (status IN ('online', 'on_the_way', 'arrived', 'busy', 'offline'))
);

ALTER TABLE provider_catalog.provider_status ENABLE ROW LEVEL SECURITY;

-- Provider can read/write their own row
DROP POLICY IF EXISTS provider_own ON provider_catalog.provider_status;
CREATE POLICY provider_own ON provider_catalog.provider_status
  FOR ALL TO authenticated
  USING  (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

-- Service role has full access
DROP POLICY IF EXISTS service_role_all ON provider_catalog.provider_status;
CREATE POLICY service_role_all ON provider_catalog.provider_status
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
