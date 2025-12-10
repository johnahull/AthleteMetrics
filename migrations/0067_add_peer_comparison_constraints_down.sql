-- Rollback migration: Remove validation constraints for peer comparison tables
-- Date: 2025-12-04

-- Remove all constraints in reverse order
ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_static_fields_null;
ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_peer_fields_required;
ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_source_valid;
ALTER TABLE site_benchmarks DROP CONSTRAINT IF EXISTS site_benchmarks_peer_percentile_range;
ALTER TABLE peer_percentile_cache DROP CONSTRAINT IF EXISTS peer_percentile_cache_sample_size_min;
