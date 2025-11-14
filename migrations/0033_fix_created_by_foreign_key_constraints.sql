-- Migration: Fix foreign key constraints for createdBy columns
-- Issue: createdBy had NOT NULL constraint with onDelete: 'set null' which are incompatible
-- Solution: Remove NOT NULL constraint to allow cascade behavior when users are deleted
--
-- This migration is safe to run on production:
-- - ALTER COLUMN DROP NOT NULL is a metadata-only operation in PostgreSQL
-- - Does not require table rewrite or full table scan
-- - No data loss (existing NOT NULL values remain intact)
-- - Allows proper cascade behavior: when user deleted, createdBy becomes NULL instead of constraint violation

-- Fix reports.created_by
ALTER TABLE reports
ALTER COLUMN created_by DROP NOT NULL;

-- Fix report_snapshots.created_by
ALTER TABLE report_snapshots
ALTER COLUMN created_by DROP NOT NULL;
