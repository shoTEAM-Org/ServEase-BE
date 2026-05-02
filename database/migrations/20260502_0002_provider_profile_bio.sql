ALTER TABLE provider_catalog.provider_profiles
  ADD COLUMN IF NOT EXISTS bio text;

UPDATE provider_catalog.provider_profiles
SET bio = service_description
WHERE bio IS NULL
  AND service_description IS NOT NULL;
