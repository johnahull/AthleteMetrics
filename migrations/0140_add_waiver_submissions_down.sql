-- Down migration: Remove waiver_submissions table (Jotform webhook intake, issue #370)

DROP INDEX IF EXISTS waiver_submissions_created_at_idx;
DROP INDEX IF EXISTS waiver_submissions_status_idx;
DROP INDEX IF EXISTS waiver_submissions_athlete_email_idx;
DROP INDEX IF EXISTS waiver_submissions_athlete_user_id_idx;
DROP TABLE IF EXISTS waiver_submissions;
