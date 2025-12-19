-- Migration: Add CHECK constraints for derived metrics data integrity
-- Purpose: Enforce invariants at database level (defense in depth)
-- Date: 2025-12-19
-- Context: PR #278 - Derived Metrics Support (follow-up security hardening)

-- Constraint: Derived metrics must have required fields
-- Ensures that if is_derived = true, then formula, dependent_metrics, and calculation_config are NOT NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_derived_metrics_valid'
  ) THEN
    ALTER TABLE site_metrics ADD CONSTRAINT chk_derived_metrics_valid
      CHECK (
        (is_derived = false) OR
        (is_derived = true AND formula IS NOT NULL
                          AND dependent_metrics IS NOT NULL
                          AND calculation_config IS NOT NULL)
      );
  END IF;
END $$;

-- Constraint: Calculated measurements must have source tracking
-- Ensures that if is_calculated = true, then calculated_from_measurement_ids and calculation_metadata are NOT NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_calculated_measurements_valid'
  ) THEN
    ALTER TABLE measurements ADD CONSTRAINT chk_calculated_measurements_valid
      CHECK (
        (is_calculated = false) OR
        (is_calculated = true AND calculated_from_measurement_ids IS NOT NULL
                              AND calculation_metadata IS NOT NULL)
      );
  END IF;
END $$;

-- Document the constraints (COMMENT ON CONSTRAINT is idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_derived_metrics_valid'
  ) THEN
    COMMENT ON CONSTRAINT chk_derived_metrics_valid ON site_metrics IS
      'Ensures derived metrics have required formula, dependent_metrics, and calculation_config fields';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_calculated_measurements_valid'
  ) THEN
    COMMENT ON CONSTRAINT chk_calculated_measurements_valid ON measurements IS
      'Ensures calculated measurements have source tracking via calculated_from_measurement_ids and calculation_metadata';
  END IF;
END $$;
