-- Rollback: Remove index on measurements.user_id

DROP INDEX IF EXISTS idx_measurements_user_id;
