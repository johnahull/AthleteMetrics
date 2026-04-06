-- Migration: Backfill is_minor for athletes aged 13-17
-- Description: Extends the isMinor flag to cover all athletes under 18.
--              Previously only athletes under 13 (COPPA threshold) had is_minor = true.
--              This supports the parent account system for 13-17 year old athletes.
--
-- Idempotent: Yes for rows where birth_date was set at the time of the first run.
--             Rows with NULL birth_date are skipped; if birth_date is later populated,
--             re-running the migration will pick them up.
--
-- Impact:     Read-only predicate on birth_date; no schema changes. Row lock contention
--             is minimal because the WHERE clause narrows to unset rows only.

UPDATE users
SET is_minor = true
WHERE birth_date IS NOT NULL
  AND CURRENT_DATE < (birth_date::date + INTERVAL '18 years')
  AND is_minor = false;
