-- Migration Rollback: Clear sport associations from default system metrics
-- Description: This rollback is intentionally a no-op because we cannot restore
--              the previous sport associations without knowing what they were.
--              The forward migration cleared all sport associations for system
--              default metrics to make them available to all sports.
-- Author: Claude Code
-- Date: 2025-12-17

-- No-op rollback: We cannot restore unknown previous sport associations
-- If you need to restore specific sport associations, you must do so manually
-- by querying historical data or re-running any business logic that determines
-- which sports should be associated with each metric.

-- This migration intentionally does nothing to prevent accidental data changes
-- during rollback without proper context.
