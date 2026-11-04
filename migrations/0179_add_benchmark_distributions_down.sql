-- Down Migration 0179 (provisional number): remove benchmark distributions.
--
-- Refuses to run while any version or distribution row exists, so loaded reference data is not dropped silently.
-- (Rows cannot be deleted while the immutability trigger exists; drop the tables by hand if removal is intended.)

DO $$
DECLARE
  v_rows INTEGER := 0;
  v_versions INTEGER := 0;
BEGIN
  IF to_regclass('benchmark_distributions') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_rows FROM benchmark_distributions;
  END IF;
  IF to_regclass('benchmark_distribution_versions') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_versions FROM benchmark_distribution_versions;
  END IF;

  IF v_rows > 0 OR v_versions > 0 THEN
    RAISE EXCEPTION 'Migration 0179 (down) refused: % distributions and % versions still exist.', v_rows, v_versions;
  END IF;
END $$;

DROP TABLE IF EXISTS benchmark_distributions;
DROP TABLE IF EXISTS benchmark_distribution_versions;
DROP FUNCTION IF EXISTS benchmark_distributions_immutable();

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0179_add_benchmark_distributions';
  END IF;
END $$;
