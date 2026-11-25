-- Migration 0187: wellness_requests.is_standing and wellness_responses.superseded_at (AM-FEAT-027 anytime survey)
--
-- is_standing: a standing (anytime) request stays open until cancelled; targeted athletes answer it from their own
-- account as often as they like. NOT NULL DEFAULT false, so every existing request stays a one-time request.
-- superseded_at: set when an athlete resubmits a standing request for the same day; the earlier row is kept, never
-- deleted, and current/analytic reads skip it. Nullable, no backfill (NULL = the live row).
-- Must match packages/shared/schema/tables/wellness.ts exactly (CI builds its DB with db:push).
--
-- The number is provisional: renumber at merge if another branch lands 0187 first (file, `_down`, test
-- `migration-0187-wellness-standing-requests`, tracking row, the line in docs/MIGRATION_SYSTEM_REMEDIATION.md).
--
-- IDEMPOTENT: safe to run multiple times.

ALTER TABLE wellness_requests ADD COLUMN IF NOT EXISTS is_standing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE wellness_responses ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMP;
