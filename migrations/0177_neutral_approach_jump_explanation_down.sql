-- Down Migration 0177: restore the 0159 APPROACH_JUMP explanation text
--
-- Puts back each 0159 text only while the field still equals the 0177 text, so an admin edit made since is kept.
-- Forgets the manual_migrations row so db:migrate:manual re-applies 0177.

UPDATE site_metrics
SET what_it_measures = 'Approach jump is your approach reach minus your standing reach, so it is the number of inches you add by jumping off a run-up.',
    updated_at = now()
WHERE code = 'APPROACH_JUMP'
  AND what_it_measures = 'Approach jump is your approach reach minus your standing reach: the height you add by jumping off a run-up.';

UPDATE site_metrics
SET why_it_matters = 'This is the jump that matters for attacking. A bigger approach jump means a higher hitting point.',
    updated_at = now()
WHERE code = 'APPROACH_JUMP'
  AND why_it_matters = 'It shows how much height you can produce after a few quick steps, as in many sports. A bigger approach jump means you get higher.';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0177_neutral_approach_jump_explanation';
  END IF;
END $$;
