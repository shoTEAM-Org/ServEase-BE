-- Category labor benchmarks for advisory pricing fairness.

CREATE TABLE IF NOT EXISTS provider_catalog.service_pricing_baselines (
  service_id uuid PRIMARY KEY
    REFERENCES provider_catalog.service_categories(id) ON DELETE CASCADE,
  pricing_mode text NOT NULL DEFAULT 'flat',
  min_labor_amount numeric(12, 2) NOT NULL,
  max_labor_amount numeric(12, 2) NOT NULL,
  typical_labor_amount numeric(12, 2) NOT NULL,
  source_note text NOT NULL DEFAULT 'ServEase category baseline',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_pricing_baselines_mode_check
    CHECK (pricing_mode IN ('flat', 'hourly')),
  CONSTRAINT service_pricing_baselines_amount_check
    CHECK (
      min_labor_amount > 0
      AND max_labor_amount >= min_labor_amount
      AND typical_labor_amount >= min_labor_amount
      AND typical_labor_amount <= max_labor_amount
    )
);

DROP TRIGGER IF EXISTS trg_service_pricing_baselines_updated_at
  ON provider_catalog.service_pricing_baselines;
CREATE TRIGGER trg_service_pricing_baselines_updated_at
BEFORE UPDATE ON provider_catalog.service_pricing_baselines
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE provider_catalog.service_pricing_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_pricing_baselines_public_read
  ON provider_catalog.service_pricing_baselines;
CREATE POLICY service_pricing_baselines_public_read
  ON provider_catalog.service_pricing_baselines
  FOR SELECT
  USING (is_active);
