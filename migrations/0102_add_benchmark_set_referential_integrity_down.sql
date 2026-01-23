-- Migration Rollback: 0102_add_benchmark_set_referential_integrity
-- Description: Remove referential integrity triggers and functions

-- Drop triggers
DROP TRIGGER IF EXISTS validate_benchmark_set_item_before_insert ON benchmark_set_items;
DROP TRIGGER IF EXISTS cascade_delete_site_benchmark_items ON site_benchmarks;
DROP TRIGGER IF EXISTS cascade_delete_custom_benchmark_items ON custom_benchmarks;

-- Drop functions
DROP FUNCTION IF EXISTS validate_benchmark_set_item_reference();
DROP FUNCTION IF EXISTS delete_benchmark_set_items_for_benchmark();
