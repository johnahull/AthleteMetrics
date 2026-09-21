-- Down migration: revert waiver_submissions.signed_at / processed_at to
-- TIMESTAMP WITHOUT TIME ZONE (matches original 0140 definition).
--
-- Converts back via UTC, matching the forward migration's interpretation.

ALTER TABLE waiver_submissions
  ALTER COLUMN signed_at TYPE TIMESTAMP USING signed_at AT TIME ZONE 'UTC';

ALTER TABLE waiver_submissions
  ALTER COLUMN processed_at TYPE TIMESTAMP USING processed_at AT TIME ZONE 'UTC';
