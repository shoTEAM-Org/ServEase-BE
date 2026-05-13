-- Phase 4: seed storage buckets used by microservice upload flows.
-- avatars: public profile photos
-- booking-attachments: private booking files with signed URLs
-- verification-docs: private provider verification documents

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('booking-attachments', 'booking-attachments', false),
  ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  updated_at = now();

COMMIT;