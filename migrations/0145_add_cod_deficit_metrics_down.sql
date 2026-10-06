-- Down Migration 0145: remove the COD deficit derived metrics
--
-- Order: (1) guard, (2) delete CALCULATED deficit measurements (derived rows
-- can be regenerated, so removing them loses nothing), (3) delete the two
-- site_metrics rows (child rows such as organization_metrics cascade by FK).
--
-- Guard: measurements.metric has no FK, so a MANUALLY entered (non-calculated)
-- deficit measurement would be silently orphaned by deleting its metric. This
-- file refuses to run if any exist. To override, export and delete those rows
-- yourself first, then re-run. No flag skips the guard.
--
-- The same refusal applies when custom_benchmarks, goals, report_benchmarks,
-- reports.config or custom_org_metrics reference the deficit codes.
--
-- The 0144 state (the _M / _YD 5-0-5 metrics) is not touched.
--
-- Transaction supplied by the runner; no BEGIN/COMMIT. Idempotent.

DO $$
DECLARE
  v_manual INTEGER;
  v_refs   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_manual
    FROM measurements
   WHERE metric IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD')
     AND is_calculated = false;

  IF v_manual > 0 THEN
    RAISE EXCEPTION 'Migration 0145 down refused: % manually entered (non-calculated) COD deficit measurement(s) exist and would be orphaned; export and delete them first', v_manual;
  END IF;

  -- Other references would be cascade-deleted (custom_benchmarks) or block the
  -- delete / dangle (goals, report_benchmarks, reports.config, custom_org_metrics).
  SELECT
      (SELECT COUNT(*) FROM custom_benchmarks WHERE metric_code IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD'))
    + (SELECT COUNT(*) FROM goals             WHERE metric      IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD'))
    + (SELECT COUNT(*) FROM report_benchmarks WHERE metric_code IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD'))
    + (SELECT COUNT(*) FROM reports           WHERE config::text ~ 'AGILITY_COD_DEFICIT_(M|YD)')
    + (SELECT COUNT(*) FROM custom_org_metrics
        WHERE coalesce(formula, '') ~ 'AGILITY_COD_DEFICIT_(M|YD)'
           OR coalesce(array_to_string(dependent_metrics, ','), '') ~ 'AGILITY_COD_DEFICIT_(M|YD)'
           OR coalesce(calculation_config::text, '') ~ 'AGILITY_COD_DEFICIT_(M|YD)')
  INTO v_refs;

  IF v_refs > 0 THEN
    RAISE EXCEPTION 'Migration 0145 down refused: % reference(s) to the COD deficit codes exist in custom_benchmarks, goals, report_benchmarks, reports.config or custom_org_metrics; remove them first', v_refs;
  END IF;
END $$;

DELETE FROM measurements
 WHERE metric IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD')
   AND is_calculated = true;

DELETE FROM site_metrics
 WHERE code IN ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD');

DO $$
BEGIN
  RAISE NOTICE 'Migration 0145 down complete: AGILITY_COD_DEFICIT_M and AGILITY_COD_DEFICIT_YD removed (calculated measurements deleted).';
END $$;
