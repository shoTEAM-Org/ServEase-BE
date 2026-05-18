-- Adds phone verification flag to users and creates the auth_challenges table
-- used by both registration OTP and login MFA flows. Idempotent.

BEGIN;

-- Phone verification flag
ALTER TABLE identity_and_user.users
  ADD COLUMN IF NOT EXISTS contact_number_verified boolean NOT NULL DEFAULT false;

-- Auth challenges: pending OTP verification for registration or login
CREATE TABLE IF NOT EXISTS identity_and_user.auth_challenges (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL,
  email          text        NOT NULL,
  otp_id         text        NOT NULL UNIQUE,
  challenge_type text        NOT NULL
    CHECK (challenge_type IN ('phone_verify', 'login_mfa')),
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_otp_id
  ON identity_and_user.auth_challenges (otp_id);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at
  ON identity_and_user.auth_challenges (expires_at);

COMMIT;
