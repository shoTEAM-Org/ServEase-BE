-- Phase 4: align booking.provider_availability + booking.provider_days_off
-- with what the BE booking-service and mobile both already consume:
--   * user_id (not provider_id)
--   * day_of_week as text day name ('Monday'..'Sunday')
--   * break_start_time / break_end_time columns
--   * provider_days_off.off_date (renamed from date)
-- Idempotent: safe to run multiple times.

BEGIN;

-- ---- provider_availability --------------------------------------------------

-- Drop the old integer CHECK + start<end CHECK (they'd block column-type change
-- and no longer apply once we allow nullable times for inactive days).
ALTER TABLE booking.provider_availability
  DROP CONSTRAINT IF EXISTS provider_availability_day_check;
ALTER TABLE booking.provider_availability
  DROP CONSTRAINT IF EXISTS provider_availability_time_check;

-- Rename provider_id -> user_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'booking'
       AND table_name = 'provider_availability'
       AND column_name = 'provider_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'booking'
       AND table_name = 'provider_availability'
       AND column_name = 'user_id'
  ) THEN
    ALTER TABLE booking.provider_availability RENAME COLUMN provider_id TO user_id;
  END IF;
END $$;

-- Change day_of_week integer -> text (map 0..6 -> Sunday..Saturday).
-- Use USING expression to preserve existing rows (if any).
ALTER TABLE booking.provider_availability
  ALTER COLUMN day_of_week TYPE text
  USING CASE day_of_week::text
    WHEN '0' THEN 'Sunday'
    WHEN '1' THEN 'Monday'
    WHEN '2' THEN 'Tuesday'
    WHEN '3' THEN 'Wednesday'
    WHEN '4' THEN 'Thursday'
    WHEN '5' THEN 'Friday'
    WHEN '6' THEN 'Saturday'
    ELSE day_of_week::text
  END;

-- Re-add CHECK with the named-day form
ALTER TABLE booking.provider_availability
  DROP CONSTRAINT IF EXISTS provider_availability_day_name_check;
ALTER TABLE booking.provider_availability
  ADD CONSTRAINT provider_availability_day_name_check
  CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'));

-- Add break times
ALTER TABLE booking.provider_availability
  ADD COLUMN IF NOT EXISTS break_start_time time,
  ADD COLUMN IF NOT EXISTS break_end_time time;

-- Allow nullable start/end for inactive days (is_active=false means closed).
ALTER TABLE booking.provider_availability
  ALTER COLUMN start_time DROP NOT NULL,
  ALTER COLUMN end_time DROP NOT NULL;

-- Recreate the old (provider_id, day_of_week) index under the new column name.
DROP INDEX IF EXISTS booking.idx_provider_availability_provider_day;
CREATE INDEX IF NOT EXISTS idx_provider_availability_user_day
  ON booking.provider_availability (user_id, day_of_week);

-- ---- provider_days_off ------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'booking'
       AND table_name = 'provider_days_off'
       AND column_name = 'provider_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'booking'
       AND table_name = 'provider_days_off'
       AND column_name = 'user_id'
  ) THEN
    ALTER TABLE booking.provider_days_off RENAME COLUMN provider_id TO user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'booking'
       AND table_name = 'provider_days_off'
       AND column_name = 'date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'booking'
       AND table_name = 'provider_days_off'
       AND column_name = 'off_date'
  ) THEN
    ALTER TABLE booking.provider_days_off RENAME COLUMN date TO off_date;
  END IF;
END $$;

-- Replace old UNIQUE(provider_id, date) with UNIQUE(user_id, off_date)
ALTER TABLE booking.provider_days_off
  DROP CONSTRAINT IF EXISTS provider_days_off_provider_id_date_key;
ALTER TABLE booking.provider_days_off
  DROP CONSTRAINT IF EXISTS provider_days_off_user_id_off_date_key;
ALTER TABLE booking.provider_days_off
  ADD CONSTRAINT provider_days_off_user_id_off_date_key UNIQUE (user_id, off_date);

COMMIT;
