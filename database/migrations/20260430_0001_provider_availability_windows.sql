-- Multi-window provider availability.
-- Keeps booking.provider_availability as a legacy fallback while moving
-- bookable intervals into booking.provider_availability_windows.

BEGIN;

CREATE TABLE IF NOT EXISTS booking.provider_availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_of_week text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_availability_windows_day_check
    CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  CONSTRAINT provider_availability_windows_time_check
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_provider_availability_windows_user_day
  ON booking.provider_availability_windows (user_id, day_of_week, is_active, sort_order);

ALTER TABLE booking.provider_availability_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all ON booking.provider_availability_windows;
CREATE POLICY admin_all ON booking.provider_availability_windows
  FOR ALL
  USING (identity_and_user.is_admin())
  WITH CHECK (identity_and_user.is_admin());

DROP TRIGGER IF EXISTS trg_provider_availability_windows_updated_at
  ON booking.provider_availability_windows;
CREATE TRIGGER trg_provider_availability_windows_updated_at
BEFORE UPDATE ON booking.provider_availability_windows
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO booking.provider_availability_windows (
  user_id,
  day_of_week,
  start_time,
  end_time,
  is_active,
  sort_order,
  created_at,
  updated_at
)
SELECT
  source.user_id,
  source.day_of_week,
  source.window_start,
  source.window_end,
  source.is_active,
  source.sort_order,
  source.created_at,
  source.updated_at
FROM (
  SELECT
    availability.user_id,
    availability.day_of_week,
    availability.start_time AS window_start,
    COALESCE(availability.break_start_time, availability.end_time) AS window_end,
    availability.is_active,
    0 AS sort_order,
    availability.created_at,
    availability.updated_at
  FROM booking.provider_availability availability
  WHERE availability.is_active = true
    AND availability.start_time IS NOT NULL
    AND availability.end_time IS NOT NULL
    AND COALESCE(availability.break_start_time, availability.end_time) > availability.start_time

  UNION ALL

  SELECT
    availability.user_id,
    availability.day_of_week,
    availability.break_end_time AS window_start,
    availability.end_time AS window_end,
    availability.is_active,
    1 AS sort_order,
    availability.created_at,
    availability.updated_at
  FROM booking.provider_availability availability
  WHERE availability.is_active = true
    AND availability.break_start_time IS NOT NULL
    AND availability.break_end_time IS NOT NULL
    AND availability.end_time IS NOT NULL
    AND availability.end_time > availability.break_end_time
) source
WHERE NOT EXISTS (
  SELECT 1
  FROM booking.provider_availability_windows existing
  WHERE existing.user_id = source.user_id
    AND existing.day_of_week = source.day_of_week
    AND existing.start_time = source.window_start
    AND existing.end_time = source.window_end
);

COMMIT;
