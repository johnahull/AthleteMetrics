-- Migration 0134: Deactivate 'd1-soc-yyir1-elite' until Pro enum lands
--
-- Follow-up to 0130 (AM-FEAT-009). The Elite/Pro YYIR1 threshold row was
-- originally seeded active with level='D1' as a placeholder because the
-- level enum has no 'Pro' value yet. Leaving it active polluted level='D1'
-- filter results with the Elite/Pro tier (≥1700 m) alongside D1 Average
-- (≥1300 m) and D1 Top 25% (≥1650 m), inflating D1 ranges in coach-facing
-- benchmark comparisons.
--
-- This migration deactivates the row in already-deployed databases so its
-- absence in level='D1' filters matches the source-file change to 0130.
-- When a 'Pro' level enum value is added in a future feature, a new
-- migration will both re-level this row to 'Pro' and reactivate it.
--
-- Idempotent: the UPDATE has no effect if the row is already inactive.

UPDATE site_benchmarks
   SET is_active = false,
       updated_at = NOW()
 WHERE id = 'd1-soc-yyir1-elite'
   AND is_active = true;

DO $$
DECLARE
  v_active INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_active
    FROM site_benchmarks
   WHERE id = 'd1-soc-yyir1-elite' AND is_active = true;

  IF v_active = 0 THEN
    RAISE NOTICE 'Migration 0134 complete: d1-soc-yyir1-elite is inactive (or not present).';
  ELSE
    RAISE WARNING 'Migration 0134: d1-soc-yyir1-elite is unexpectedly still active.';
  END IF;
END $$;
