-- Migration: 0024_add_parent_user_id
-- Adds parentUserId to parent_athlete_links table so that once a parent
-- registers an account, the link can be upgraded from email-only to a
-- full FK reference, enabling server-side session-based access checks.

ALTER TABLE parent_athlete_links
  ADD COLUMN IF NOT EXISTS parent_user_id VARCHAR
    REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS parent_athlete_links_parent_user_idx
  ON parent_athlete_links (parent_user_id);
