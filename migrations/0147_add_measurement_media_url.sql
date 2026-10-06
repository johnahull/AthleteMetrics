-- Migration 0147: add generic nullable media link to measurements (AM-FEAT-015 Phase 2)
--
-- media_url is a generic, optional link (e.g. a video clip) attached to a single measurement.
-- It is validated at write time (https only, public host, max 2048 chars) in the Zod schemas
-- (packages/shared/schema-original.ts via isSafePublicUrl in packages/shared/url-safety.ts).
-- It is intentionally NOT exposed in public report snapshots or any CSV / LLM / COPPA export.
--
-- No index in v1 (never filtered or sorted on).
-- Idempotent: safe to run more than once.
--
-- Note: 0144/0145 are reserved for AM-FEAT-016, so a numbering gap is expected.

ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS media_url text;

COMMENT ON COLUMN measurements.media_url IS
  'Optional https link to media (e.g. video clip) for this measurement. Never included in public reports or exports.';
