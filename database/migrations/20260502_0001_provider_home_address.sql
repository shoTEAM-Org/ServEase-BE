ALTER TABLE provider_catalog.provider_profiles
  ADD COLUMN IF NOT EXISTS home_address text;
