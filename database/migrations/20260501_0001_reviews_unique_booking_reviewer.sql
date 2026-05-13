-- Enforce one review per reviewer per booking, including databases created
-- before the init migration carried this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_booking_reviewer_unique
  ON trust_and_reputation.reviews (booking_id, reviewer_id);
