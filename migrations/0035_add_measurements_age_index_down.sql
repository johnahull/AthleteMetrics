-- Migration: Rollback age index on measurements table
-- Date: 2025-11-22
-- Purpose: Remove index created in migration 0035
--
-- Using CONCURRENTLY to avoid table locks during production deployment
DROP INDEX CONCURRENTLY IF EXISTS idx_measurements_age;
