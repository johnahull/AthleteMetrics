-- Rollback Migration: Restore foreign key constraints on measurements table
-- WARNING: This rollback will FAIL if any measurements reference deleted users
-- This is expected and correct - measurements should reference valid users if FKs are enforced

-- Remove comments
COMMENT ON TABLE measurements IS NULL;
COMMENT ON COLUMN measurements.user_id IS NULL;
COMMENT ON COLUMN measurements.submitted_by IS NULL;
COMMENT ON COLUMN measurements.verified_by IS NULL;

-- Restore foreign key constraint on verified_by (nullable, so safe to add)
ALTER TABLE measurements
ADD CONSTRAINT measurements_verified_by_users_id_fk
FOREIGN KEY (verified_by) REFERENCES users(id);

-- Restore foreign key constraint on submitted_by
-- NOTE: This will fail if any measurements reference deleted submitters
ALTER TABLE measurements
ADD CONSTRAINT measurements_submitted_by_users_id_fk
FOREIGN KEY (submitted_by) REFERENCES users(id);

-- Restore foreign key constraint on user_id (athlete)
-- NOTE: This will fail if any measurements reference deleted athletes
ALTER TABLE measurements
ADD CONSTRAINT measurements_user_id_users_id_fk
FOREIGN KEY (user_id) REFERENCES users(id);
