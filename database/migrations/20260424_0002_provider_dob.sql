-- Phase 1 auth fix: provider DOB + backfill safety.
-- Adds date_of_birth to provider_profiles so provider signup can persist it
-- alongside the existing customer_profiles.date_of_birth.

BEGIN;

ALTER TABLE provider_catalog.provider_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

COMMIT;
