-- Migration: 0116_parent_athlete_links_unique
-- Purpose: Add UNIQUE(parent_email, athlete_user_id) constraint to parent_athlete_links
-- to enable proper upsert deduplication in initiateConsent().
-- Without this, onConflictDoUpdate has no target and every consent resend inserts
-- a duplicate row — GET /api/parent/children returns duplicates.

-- Step 1: Deduplicate existing rows (keep newest per pair)
DELETE FROM parent_athlete_links
WHERE id NOT IN (
  SELECT DISTINCT ON (parent_email, athlete_user_id) id
  FROM parent_athlete_links
  ORDER BY parent_email, athlete_user_id, created_at DESC NULLS LAST
);

-- Step 2: Add the unique constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'parent_athlete_links_parent_email_athlete_user_id_unique'
  ) THEN
    ALTER TABLE parent_athlete_links
      ADD CONSTRAINT parent_athlete_links_parent_email_athlete_user_id_unique
      UNIQUE (parent_email, athlete_user_id);
  END IF;
END $$;
