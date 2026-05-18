-- Ensure booking.provider_availability has an id column used by the booking service
-- for upsert operations. Idempotent — safe to re-run.

BEGIN;

-- Add id column if missing
ALTER TABLE booking.provider_availability
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

-- Backfill any rows that have a NULL id (possible if column existed without default)
UPDATE booking.provider_availability
  SET id = gen_random_uuid()
  WHERE id IS NULL;

-- Add primary key constraint only if no primary key already exists on this table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'booking.provider_availability'::regclass
       AND contype = 'p'
  ) THEN
    ALTER TABLE booking.provider_availability ADD PRIMARY KEY (id);
  END IF;
END $$;

COMMIT;
