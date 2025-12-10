-- Migration: Add performance indexes for peer comparison queries
-- Date: 2025-12-04
-- Purpose: Optimize peer pool measurement queries with composite indexes
-- Expected impact: 5-10x faster peer percentile calculations for large datasets

-- Index for peer pool queries (metric + verified + user + value)
-- Supports: WHERE metric = ? AND is_verified = true AND user_id IN (...)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_measurements_metric_verified_user
ON measurements (metric, is_verified, user_id)
WHERE is_verified = true;

-- Index for user filtering in peer pool selection
-- Supports: WHERE is_active = true AND gender = ? AND birth_date BETWEEN ? AND ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_peer_filters
ON users (is_active, gender, birth_date)
WHERE is_active = true;

-- GIN index for sports array search
-- Supports: WHERE sports && ARRAY[?] (overlap operator for array search)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_sports_gin
ON users USING GIN (sports);

-- Note: CONCURRENTLY prevents table locks during index creation
-- Safe to run in production without downtime
