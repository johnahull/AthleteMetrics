-- Down Migration 0163: AGILITY_COD_DEFICIT_M_INTERP goes back to best-of-each inputs
--
-- Removes calculationConfig.sameRunInputs and forgets this migration's manual_migrations row
-- so the next forward deploy re-applies it. Calculated rows are not touched.

UPDATE site_metrics
   SET calculation_config = calculation_config - 'sameRunInputs'
 WHERE code = 'AGILITY_COD_DEFICIT_M_INTERP'
   AND calculation_config IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0163_cod_deficit_same_run_inputs';
  END IF;
END $$;
