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
--
-- Locking: apply-manual-migrations.js runs this whole file in ONE transaction, so the
-- ACCESS EXCLUSIVE lock taken by ADD COLUMN is held until COMMIT. lock_timeout makes the
-- migration fail fast instead of queueing behind long-running queries (and blocking
-- every other query on measurements while it waits).

SET LOCAL lock_timeout = '5s';

ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS media_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'measurements'::regclass
       AND conname = 'measurements_media_url_length_check'
  ) THEN
    -- NOT VALID: no full-table scan inside this transaction. New writes are checked
    -- immediately; existing rows need no check because the column was just added
    -- (all NULL). A later migration may VALIDATE it in its own transaction
    -- (SHARE UPDATE EXCLUSIVE lock) to mark it validated.
    ALTER TABLE measurements
      ADD CONSTRAINT measurements_media_url_length_check
      CHECK (char_length(media_url) <= 2048) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN measurements.media_url IS
  'Optional https link to media (e.g. video clip) for this measurement. Never included in public reports or exports.';
