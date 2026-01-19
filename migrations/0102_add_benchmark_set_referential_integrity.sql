-- Migration: 0102_add_benchmark_set_referential_integrity
-- Description: Add referential integrity validation for polymorphic benchmark_set_items
-- Date: 2026-01-19
--
-- Purpose:
-- Ensures benchmark_set_items.benchmark_id references valid site_benchmarks or custom_benchmarks
-- Prevents orphaned references when benchmarks are deleted
-- Implements cascade deletion for benchmark set items when referenced benchmarks are removed

-- ============================================================================
-- Validation trigger: Ensure benchmark_id references valid benchmark
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_benchmark_set_item_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.benchmark_type = 'site' THEN
    IF NOT EXISTS (SELECT 1 FROM site_benchmarks WHERE id = NEW.benchmark_id) THEN
      RAISE EXCEPTION 'Referenced site benchmark % does not exist', NEW.benchmark_id;
    END IF;
  ELSIF NEW.benchmark_type = 'custom' THEN
    IF NOT EXISTS (SELECT 1 FROM custom_benchmarks WHERE id = NEW.benchmark_id) THEN
      RAISE EXCEPTION 'Referenced custom benchmark % does not exist', NEW.benchmark_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply validation trigger on INSERT and UPDATE
CREATE TRIGGER validate_benchmark_set_item_before_insert
BEFORE INSERT OR UPDATE ON benchmark_set_items
FOR EACH ROW EXECUTE FUNCTION validate_benchmark_set_item_reference();

-- ============================================================================
-- Cascade delete trigger: Remove set items when benchmarks are deleted
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_benchmark_set_items_for_benchmark()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM benchmark_set_items
  WHERE benchmark_id = OLD.id
    AND benchmark_type = TG_ARGV[0];
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply cascade delete trigger for site benchmarks
CREATE TRIGGER cascade_delete_site_benchmark_items
AFTER DELETE ON site_benchmarks
FOR EACH ROW EXECUTE FUNCTION delete_benchmark_set_items_for_benchmark('site');

-- Apply cascade delete trigger for custom benchmarks
CREATE TRIGGER cascade_delete_custom_benchmark_items
AFTER DELETE ON custom_benchmarks
FOR EACH ROW EXECUTE FUNCTION delete_benchmark_set_items_for_benchmark('custom');

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON FUNCTION validate_benchmark_set_item_reference() IS
  'Validates that benchmark_set_items.benchmark_id references a valid site or custom benchmark';

COMMENT ON FUNCTION delete_benchmark_set_items_for_benchmark() IS
  'Cascade deletes benchmark_set_items when referenced benchmarks are deleted';
