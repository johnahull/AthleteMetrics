-- Migration: Add CHECK constraints for derived metrics data integrity
-- Purpose: Enforce invariants at database level (defense in depth)
-- Date: 2025-12-19
-- Context: PR #278 - Derived Metrics Support (follow-up security hardening)

-- Constraint: Derived metrics must have required fields
-- Ensures that if is_derived = true, then formula, dependent_metrics, and calculation_config are NOT NULL
ALTER TABLE site_metrics ADD CONSTRAINT IF NOT EXISTS chk_derived_metrics_valid
  CHECK (
    (is_derived = false) OR
    (is_derived = true AND formula IS NOT NULL
                      AND dependent_metrics IS NOT NULL
                      AND calculation_config IS NOT NULL)
  );

-- Constraint: Calculated measurements must have source tracking
-- Ensures that if is_calculated = true, then calculated_from_measurement_ids and calculation_metadata are NOT NULL
ALTER TABLE measurements ADD CONSTRAINT IF NOT EXISTS chk_calculated_measurements_valid
  CHECK (
    (is_calculated = false) OR
    (is_calculated = true AND calculated_from_measurement_ids IS NOT NULL
                          AND calculation_metadata IS NOT NULL)
  );

-- Document the constraints
COMMENT ON CONSTRAINT chk_derived_metrics_valid ON site_metrics IS
  'Ensures derived metrics have required formula, dependent_metrics, and calculation_config fields';

COMMENT ON CONSTRAINT chk_calculated_measurements_valid ON measurements IS
  'Ensures calculated measurements have source tracking via calculated_from_measurement_ids and calculation_metadata';
