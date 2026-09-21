-- Migration: Add waiver_submissions table for Jotform webhook intake (issue #370)
--
-- Tracks raw waiver submissions received via external webhooks. The unique
-- constraint on submission_id provides idempotency for retried webhook deliveries.
-- Raw payload is preserved for manual recovery if downstream processing fails.

CREATE TABLE IF NOT EXISTS waiver_submissions (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   TEXT NOT NULL UNIQUE,
  form_id         TEXT,
  source          TEXT NOT NULL DEFAULT 'jotform',
  athlete_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  athlete_email   TEXT,
  athlete_first_name TEXT,
  athlete_last_name  TEXT,
  athlete_birth_date DATE,
  parent_name     TEXT,
  parent_email    TEXT,
  parent_phone    TEXT,
  pdf_url         TEXT,
  signed_at       TIMESTAMP,
  status          TEXT NOT NULL DEFAULT 'received'
                  CHECK (status IN ('received', 'processed', 'failed')),
  error_message   TEXT,
  raw_payload     JSONB NOT NULL,
  processed_at    TIMESTAMP,
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waiver_submissions_athlete_user_id_idx
  ON waiver_submissions (athlete_user_id);
CREATE INDEX IF NOT EXISTS waiver_submissions_athlete_email_idx
  ON waiver_submissions (athlete_email);
CREATE INDEX IF NOT EXISTS waiver_submissions_status_idx
  ON waiver_submissions (status);
CREATE INDEX IF NOT EXISTS waiver_submissions_created_at_idx
  ON waiver_submissions (created_at);
