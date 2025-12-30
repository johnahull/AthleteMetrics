-- Rollback: Remove CHECK constraints for derived metrics
-- Reverts migration 0085_add_derived_metrics_constraints.sql

-- Remove constraint from site_metrics
ALTER TABLE site_metrics DROP CONSTRAINT IF EXISTS chk_derived_metrics_valid;

-- Remove constraint from measurements
ALTER TABLE measurements DROP CONSTRAINT IF EXISTS chk_calculated_measurements_valid;
