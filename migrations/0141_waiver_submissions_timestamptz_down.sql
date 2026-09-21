-- Down migration: revert waiver_submissions.signed_at / processed_at to
-- TIMESTAMP WITHOUT TIME ZONE (matches original 0140 definition).
--
-- Converts back via UTC, matching the forward migration's interpretation.
-- Guarded by current data_type for the same reason as the forward migration
-- (see its comment) — rerunning against an already-naive column would
-- reinterpret it through the session's timezone instead of leaving it alone.

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'waiver_submissions' AND column_name = 'signed_at')
     <> 'timestamp without time zone' THEN
    ALTER TABLE waiver_submissions
      ALTER COLUMN signed_at TYPE TIMESTAMP USING signed_at AT TIME ZONE 'UTC';
  END IF;

  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'waiver_submissions' AND column_name = 'processed_at')
     <> 'timestamp without time zone' THEN
    ALTER TABLE waiver_submissions
      ALTER COLUMN processed_at TYPE TIMESTAMP USING processed_at AT TIME ZONE 'UTC';
  END IF;
END $$;
