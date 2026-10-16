-- Down Migration 0161: remove AGILITY_COD_DEFICIT_M_INTERP
--
-- ORDER: run this file (0161_down) BEFORE 0144_down: the formula references the
-- _M leg metrics that 0144_down removes (0144_down refuses while this metric exists).
-- It is independent of 0145_down.
--
-- Steps: (1) guard, (2) delete CALCULATED measurements of the metric (derived rows
-- can be regenerated, so removing them loses nothing), (3) delete its
-- organization_metrics rows, (4) delete the site_metrics row, (5) delete this
-- migration's manual_migrations tracking row.
--
-- Tracking: the runner skips a migration by name once recorded, and a rollback
-- must not leave the row behind or the next forward deploy would silently skip
-- 0161. Step 5 is a no-op if the row or the table is absent.
--
-- Guard: measurements.metric has no FK, so a MANUALLY entered (non-calculated)
-- measurement would be silently orphaned by deleting its metric. This file refuses
-- to run if any exist. To override, export and delete those rows yourself first,
-- then re-run. No flag skips the guard.
--
-- The same refusal applies when custom_benchmarks, goals, report_benchmarks,
-- reports.config, custom_org_metrics, site_benchmarks, event_metrics or
-- site_metric_explanations reference the code. Deleting the site_metrics row would
-- cascade-delete those site_benchmarks / event_metrics / site_metric_explanations
-- rows, and benchmark_set_items / organization_benchmarks (no FK) that point at such
-- benchmarks would survive as orphans.
--
-- The 0144 / 0145 state is not touched.
--
-- Transaction supplied by the runner; no BEGIN/COMMIT. Idempotent.

DO $$
DECLARE
  v_manual INTEGER;
  v_refs   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_manual
    FROM measurements
   WHERE metric = 'AGILITY_COD_DEFICIT_M_INTERP'
     AND is_calculated = false;

  IF v_manual > 0 THEN
    RAISE EXCEPTION 'Migration 0161 down refused: % manually entered (non-calculated) AGILITY_COD_DEFICIT_M_INTERP measurement(s) exist and would be orphaned; export and delete them first', v_manual;
  END IF;

  SELECT
      (SELECT COUNT(*) FROM custom_benchmarks WHERE metric_code = 'AGILITY_COD_DEFICIT_M_INTERP')
    + (SELECT COUNT(*) FROM goals             WHERE metric      = 'AGILITY_COD_DEFICIT_M_INTERP')
    + (SELECT COUNT(*) FROM report_benchmarks WHERE metric_code = 'AGILITY_COD_DEFICIT_M_INTERP')
    + (SELECT COUNT(*) FROM reports           WHERE config::text ~ '\mAGILITY_COD_DEFICIT_M_INTERP\M')
    + (SELECT COUNT(*) FROM site_benchmarks   WHERE metric_code = 'AGILITY_COD_DEFICIT_M_INTERP')
    + (SELECT COUNT(*) FROM event_metrics     WHERE metric_code = 'AGILITY_COD_DEFICIT_M_INTERP')
    + (SELECT COUNT(*) FROM site_metric_explanations WHERE metric_code = 'AGILITY_COD_DEFICIT_M_INTERP')
    + (SELECT COUNT(*) FROM custom_org_metrics
        WHERE coalesce(formula, '') ~ '\mAGILITY_COD_DEFICIT_M_INTERP\M'
           OR coalesce(array_to_string(dependent_metrics, ','), '') ~ '\mAGILITY_COD_DEFICIT_M_INTERP\M'
           OR coalesce(calculation_config::text, '') ~ '\mAGILITY_COD_DEFICIT_M_INTERP\M')
  INTO v_refs;

  IF v_refs > 0 THEN
    RAISE EXCEPTION 'Migration 0161 down refused: % reference(s) to AGILITY_COD_DEFICIT_M_INTERP exist in custom_benchmarks, goals, report_benchmarks, reports.config, custom_org_metrics, site_benchmarks, event_metrics or site_metric_explanations; remove them first', v_refs;
  END IF;
END $$;

DELETE FROM measurements
 WHERE metric = 'AGILITY_COD_DEFICIT_M_INTERP'
   AND is_calculated = true;

DELETE FROM organization_metrics
 WHERE metric_code = 'AGILITY_COD_DEFICIT_M_INTERP';

DELETE FROM site_metrics
 WHERE code = 'AGILITY_COD_DEFICIT_M_INTERP';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0161_add_cod_deficit_m_interp';
  END IF;
  RAISE NOTICE 'Migration 0161 down complete: AGILITY_COD_DEFICIT_M_INTERP removed (calculated measurements deleted).';
END $$;
