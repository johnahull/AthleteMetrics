-- Rollback: Remove onboarding tracking column

ALTER TABLE users
DROP COLUMN has_completed_onboarding;
