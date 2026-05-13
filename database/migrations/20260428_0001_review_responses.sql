-- Review Responses Feature
-- Allows providers to respond to customer reviews

BEGIN;

-- Create review_responses table
CREATE TABLE IF NOT EXISTS trust_and_reputation.review_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES trust_and_reputation.reviews(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL,
  response_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_responses_review_id_unique UNIQUE (review_id),
  CONSTRAINT review_responses_text_length CHECK (char_length(response_text) >= 1 AND char_length(response_text) <= 1000)
);

-- Index for efficient lookups by review_id
CREATE INDEX IF NOT EXISTS idx_review_responses_review 
  ON trust_and_reputation.review_responses (review_id);

-- Index for looking up responses by responder
CREATE INDEX IF NOT EXISTS idx_review_responses_responder 
  ON trust_and_reputation.review_responses (responder_id, created_at DESC);

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_review_responses_updated_at ON trust_and_reputation.review_responses;
CREATE TRIGGER trg_review_responses_updated_at
  BEFORE UPDATE ON trust_and_reputation.review_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;