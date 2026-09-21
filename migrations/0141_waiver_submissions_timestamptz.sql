-- Migration: waiver_submissions.signed_at / processed_at -> TIMESTAMPTZ
--
-- Context (code review on PR #390, addressed here): `signed_at` and
-- `processed_at` were created as TIMESTAMP WITHOUT TIME ZONE in migration
-- 0140. Every other timestamp column in this schema is also naive TIMESTAMP
-- (no existing use of `withTimezone` anywhere) — that is a deliberate,
-- pervasive convention for internally-generated timestamps (`now()`,
-- `new Date()`), where "naive == UTC" is an implicit but consistent contract.
--
-- waiver_submissions is different: `signed_at` is parsed from a Jotform
-- webhook payload — an externally-authored ISO 8601 string that carries its
-- own UTC offset (e.g. "2024-09-01T12:00:00Z"). A naive TIMESTAMP column's
-- on-disk representation for a given instant can vary with the writing
-- session's timezone setting, unlike TIMESTAMPTZ which always normalizes to
-- a single absolute instant regardless of session timezone. This is a
-- narrow, deliberate exception to the codebase-wide convention for this one
-- externally-sourced column pair, not a signal to convert other tables.
--
-- `processed_at` is converted alongside `signed_at` for internal consistency
-- within this table (both represent points in time tied to the same
-- submission lifecycle), even though it's server-generated like the rest of
-- the schema's naive-TIMESTAMP columns.
--
-- Safe to re-run: ALTER COLUMN ... TYPE is idempotent when the column is
-- already TIMESTAMPTZ (no-op). Existing naive values are interpreted as UTC
-- via the USING clause, matching how they were actually written (new Date()
-- / Date.parse() are always UTC-based in Node).

ALTER TABLE waiver_submissions
  ALTER COLUMN signed_at TYPE TIMESTAMPTZ USING signed_at AT TIME ZONE 'UTC';

ALTER TABLE waiver_submissions
  ALTER COLUMN processed_at TYPE TIMESTAMPTZ USING processed_at AT TIME ZONE 'UTC';
