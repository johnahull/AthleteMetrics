-- Apply missing migrations that were skipped due to drizzle-kit push initialization
-- This script is safe to run multiple times (uses IF NOT EXISTS checks)

-- Migration 0005: Add soft delete support to users table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
        CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;
        COMMENT ON COLUMN users.deleted_at IS 'Soft delete timestamp - NULL means active, non-NULL means deleted. User data preserved for historical context.';
        RAISE NOTICE 'Added deleted_at column to users table';
    ELSE
        RAISE NOTICE 'Column deleted_at already exists in users table - skipping';
    END IF;
END $$;

-- Migration 0012: Fix audit_logs.user_id to be nullable
DO $$
BEGIN
    -- Check if column is NOT NULL
    IF EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'audit_logs'
        AND column_name = 'user_id'
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
        COMMENT ON COLUMN audit_logs.user_id IS 'User who performed the action (NULL if user deleted, preserving audit trail)';
        RAISE NOTICE 'Removed NOT NULL constraint from audit_logs.user_id';
    ELSE
        RAISE NOTICE 'audit_logs.user_id is already nullable - skipping';
    END IF;
END $$;

-- Verify the changes
SELECT
    'users.deleted_at' as column_name,
    CASE WHEN EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'deleted_at'
    ) THEN 'EXISTS' ELSE 'MISSING' END as status
UNION ALL
SELECT
    'audit_logs.user_id (nullable)' as column_name,
    CASE WHEN EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'audit_logs'
        AND column_name = 'user_id'
        AND is_nullable = 'YES'
    ) THEN 'YES' ELSE 'NO' END as status;
