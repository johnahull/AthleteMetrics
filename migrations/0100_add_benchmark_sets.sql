-- Migration: Add Benchmark Sets feature
-- Description: Creates tables for benchmark sets (named collections of benchmarks)
-- that can be used in reports and analytics

-- ============================================================================
-- Table: benchmark_sets
-- Named collections of benchmarks (e.g., "NCAA D1 Women's Soccer")
-- ============================================================================
CREATE TABLE IF NOT EXISTS benchmark_sets (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sport VARCHAR(50),
    level VARCHAR(50),
    gender VARCHAR(20),
    is_template BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP
);

-- Indexes for benchmark_sets
CREATE INDEX IF NOT EXISTS benchmark_sets_org_idx ON benchmark_sets(organization_id);
CREATE INDEX IF NOT EXISTS benchmark_sets_active_idx ON benchmark_sets(is_active);

-- Unique constraint: name must be unique within an organization
-- For org-level sets: name unique within organization
CREATE UNIQUE INDEX IF NOT EXISTS benchmark_sets_unique_org_name
    ON benchmark_sets(organization_id, name) WHERE organization_id IS NOT NULL;

-- For site-level templates: name globally unique (prevent duplicate templates)
CREATE UNIQUE INDEX IF NOT EXISTS benchmark_sets_unique_site_name
    ON benchmark_sets(name) WHERE organization_id IS NULL;

-- ============================================================================
-- Table: benchmark_set_items
-- Individual benchmarks within a set
-- ============================================================================
CREATE TABLE IF NOT EXISTS benchmark_set_items (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id VARCHAR NOT NULL REFERENCES benchmark_sets(id) ON DELETE CASCADE,
    benchmark_id VARCHAR NOT NULL,
    benchmark_type VARCHAR(10) NOT NULL CHECK (benchmark_type IN ('site', 'custom')),
    display_order INTEGER NOT NULL DEFAULT 999,
    custom_label VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for benchmark_set_items
CREATE INDEX IF NOT EXISTS benchmark_set_items_set_idx ON benchmark_set_items(set_id);
CREATE INDEX IF NOT EXISTS benchmark_set_items_benchmark_idx ON benchmark_set_items(benchmark_id, benchmark_type);
CREATE INDEX IF NOT EXISTS benchmark_set_items_set_order_idx ON benchmark_set_items(set_id, display_order);

-- Unique constraint: a benchmark can only appear once per set (same benchmark_id + type)
CREATE UNIQUE INDEX IF NOT EXISTS benchmark_set_items_unique
    ON benchmark_set_items(set_id, benchmark_id, benchmark_type);

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE benchmark_sets IS 'Named collections of benchmarks for use in reports and analytics';
COMMENT ON COLUMN benchmark_sets.organization_id IS 'NULL for site-level template sets';
COMMENT ON COLUMN benchmark_sets.is_template IS 'Template sets can be copied by organizations';
COMMENT ON COLUMN benchmark_sets.sport IS 'Sport filter for the set (e.g., SOCCER)';
COMMENT ON COLUMN benchmark_sets.level IS 'Competition level (e.g., College, HS)';
COMMENT ON COLUMN benchmark_sets.gender IS 'Gender filter (Male, Female, Not Specified)';

COMMENT ON TABLE benchmark_set_items IS 'Individual benchmarks within a benchmark set';
COMMENT ON COLUMN benchmark_set_items.benchmark_type IS 'site for site_benchmarks, custom for custom_benchmarks';
COMMENT ON COLUMN benchmark_set_items.display_order IS 'Order in which benchmarks appear in the set';
COMMENT ON COLUMN benchmark_set_items.custom_label IS 'Optional override label for the benchmark in this set';
