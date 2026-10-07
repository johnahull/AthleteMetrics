-- Migration 0147: add generic nullable media link to measurements (AM-FEAT-015 Phase 2)
--
-- media_url is a generic, optional link (e.g. a video clip) attached to a single measurement.
-- It is validated at write time (https only, public host, no credentials, canonical form,
-- max 2048 chars) by mediaUrlSchema in packages/shared/schema-original.ts (isSafePublicUrl in
-- packages/shared/url-safety.ts). The CHECK constraint below backstops the length limit for
-- writes that bypass the schema.
-- It is intentionally NOT exposed in public report snapshots or any CSV / LLM / COPPA export.
--
-- No index in v1 (never filtered or sorted on).
-- Idempotent: safe to run more than once.
--
-- Note: 0144/0145 are reserved for AM-FEAT-016, so a numbering gap is expected.

ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS media_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'measurements'::regclass
       AND conname = 'measurements_media_url_length_check'
  ) THEN
    -- NOT VALID: skip the full-table scan while ADD CONSTRAINT holds its lock;
    -- new writes are checked immediately, existing rows by VALIDATE below.
    ALTER TABLE measurements
      ADD CONSTRAINT measurements_media_url_length_check
      CHECK (char_length(media_url) <= 2048) NOT VALID;
  END IF;
END $$;

-- Scans existing rows under a SHARE UPDATE EXCLUSIVE lock (reads and writes
-- continue). A no-op when the constraint is already validated (re-apply).
ALTER TABLE measurements
  VALIDATE CONSTRAINT measurements_media_url_length_check;

COMMENT ON COLUMN measurements.media_url IS
  'Optional https link to media (e.g. video clip) for this measurement. Never included in public reports or exports.';
