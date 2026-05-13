-- Advisory pricing engine support.

ALTER TABLE booking.bookings
  ADD COLUMN IF NOT EXISTS pricing_snapshot jsonb;

CREATE TABLE IF NOT EXISTS provider_catalog.provider_travel_profiles (
  provider_id uuid PRIMARY KEY
    REFERENCES provider_catalog.provider_profiles(user_id) ON DELETE CASCADE,
  vehicle_type text NOT NULL DEFAULT 'motorcycle',
  fuel_type text NOT NULL DEFAULT 'gasoline',
  fuel_efficiency_km_per_liter numeric(8, 2) NOT NULL DEFAULT 45,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_travel_profiles_vehicle_check
    CHECK (vehicle_type IN ('motorcycle', 'car', 'van')),
  CONSTRAINT provider_travel_profiles_fuel_check
    CHECK (fuel_type IN ('gasoline', 'diesel')),
  CONSTRAINT provider_travel_profiles_efficiency_check
    CHECK (fuel_efficiency_km_per_liter > 0)
);

DROP TRIGGER IF EXISTS trg_provider_travel_profiles_updated_at
  ON provider_catalog.provider_travel_profiles;
CREATE TRIGGER trg_provider_travel_profiles_updated_at
BEFORE UPDATE ON provider_catalog.provider_travel_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS booking.fuel_price_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL DEFAULT 'PH',
  fuel_type text NOT NULL,
  price_per_liter numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'PHP',
  source_name text NOT NULL,
  source_url text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_price_cache_fuel_check
    CHECK (fuel_type IN ('gasoline', 'diesel')),
  CONSTRAINT fuel_price_cache_price_check
    CHECK (price_per_liter > 0)
);

CREATE INDEX IF NOT EXISTS idx_fuel_price_cache_latest
  ON booking.fuel_price_cache (country_code, fuel_type, fetched_at DESC);
