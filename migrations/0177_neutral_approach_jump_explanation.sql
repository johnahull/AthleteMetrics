-- Migration 0177: sport- and unit-neutral APPROACH_JUMP explanation
--
-- 0159 wrote volleyball copy ("attacking", "hitting point") and "inches" for APPROACH_JUMP, but the metric is used in
-- other sports and its unit is the metric's own (site_metrics.unit). Rewrites what_it_measures and why_it_matters only
-- while each still equals the 0159 text, so a site admin's edit is kept and a re-run changes nothing.
-- Number provisional; renumber at merge if another branch lands 0177 first (file, `_down`, test, tracking row, docs line).

UPDATE site_metrics
SET what_it_measures = 'Approach jump is your approach reach minus your standing reach: the height you add by jumping off a run-up.',
    updated_at = now()
WHERE code = 'APPROACH_JUMP'
  AND what_it_measures = 'Approach jump is your approach reach minus your standing reach, so it is the number of inches you add by jumping off a run-up.';

UPDATE site_metrics
SET why_it_matters = 'It shows how much height you can produce after a few quick steps, as in many sports. A bigger approach jump means you get higher.',
    updated_at = now()
WHERE code = 'APPROACH_JUMP'
  AND why_it_matters = 'This is the jump that matters for attacking. A bigger approach jump means a higher hitting point.';
