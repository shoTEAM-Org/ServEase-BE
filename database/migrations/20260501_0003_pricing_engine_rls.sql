-- RLS policies for pricing engine support tables.

ALTER TABLE provider_catalog.provider_travel_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking.fuel_price_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS provider_travel_profiles_owner_select
  ON provider_catalog.provider_travel_profiles;
CREATE POLICY provider_travel_profiles_owner_select
  ON provider_catalog.provider_travel_profiles
  FOR SELECT
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_travel_profiles_owner_insert
  ON provider_catalog.provider_travel_profiles;
CREATE POLICY provider_travel_profiles_owner_insert
  ON provider_catalog.provider_travel_profiles
  FOR INSERT
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_travel_profiles_owner_update
  ON provider_catalog.provider_travel_profiles;
CREATE POLICY provider_travel_profiles_owner_update
  ON provider_catalog.provider_travel_profiles
  FOR UPDATE
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS fuel_price_cache_public_read
  ON booking.fuel_price_cache;
CREATE POLICY fuel_price_cache_public_read
  ON booking.fuel_price_cache
  FOR SELECT
  USING (true);
