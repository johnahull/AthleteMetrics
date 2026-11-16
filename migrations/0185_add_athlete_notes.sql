-- Migration 0185: athlete_notes (AM-FEAT-025, athlete coaching notes)
--
-- A dated, organization-scoped log a coach keeps about an athlete. Visible only to writers (coach / org_admin /
-- site admin) of the note's organization. Must match packages/shared/schema/tables/athlete-notes.ts exactly
-- (CI builds its DB with db:push), including the ON DELETE behavior:
--   athlete_id       -> users.id          ON DELETE CASCADE (deleteAthlete / hardDeleteUser hard-delete the user)
--   organization_id  -> organizations.id  ON DELETE CASCADE (deleteOrganization hard-deletes the organization)
--   author_id        -> users.id          ON DELETE SET NULL (the note outlives its author)
--   event_id         -> events.id         ON DELETE SET NULL
-- observed_on has no default: the client sends the coach's local date.
--
-- The number is provisional: renumber at merge if another branch lands 0185 first (file, `_down`, test
-- `migration-0185-athlete-notes`, tracking row, the line in docs/MIGRATION_SYSTEM_REMEDIATION.md).
--
-- IDEMPOTENT: safe to run multiple times.

CREATE TABLE IF NOT EXISTS athlete_notes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  author_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  event_id VARCHAR(36) REFERENCES events(id) ON DELETE SET NULL,
  category TEXT,
  flagged BOOLEAN NOT NULL DEFAULT false,
  observed_on DATE NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS athlete_notes_athlete_org_observed_idx
  ON athlete_notes (athlete_id, organization_id, observed_on);
