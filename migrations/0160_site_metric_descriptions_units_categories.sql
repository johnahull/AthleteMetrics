-- Migration 0160: fill gaps in site_metrics reference data
--
-- 1. description for APPROACH_JUMP, APPROACH_REACH, BLOCK_JUMP, BLOCK_REACH, DASH_10YD and TOP_SPEED_MPH (only where empty).
-- 2. unit 'ratio' for RSI, RSI_SINGLE_LEFT, RSI_SINGLE_RIGHT and RSI_105 (only where empty), matching RSI_L, RSI_R and POWER_EUR.
-- 3. one spelling per category: 'power' -> 'Power' (RSI, RSI_105) and 'Speed' / 'Acceleration' -> 'speed'
--    (DASH_5YD, DASH_20YD, DASH_30YD, TOP_SPEED_MPH, DASH_10YD). The majority spelling wins; no code matches on these strings.
-- Re-running changes nothing: every statement only touches rows that still have the old value.
-- Number provisional; renumber at merge if another branch lands 0160 first (file, `_down`, test, tracking row, docs line).

UPDATE site_metrics AS m
SET description = v.description, updated_at = now()
FROM (VALUES
  ('APPROACH_JUMP', 'Approach jump: how many inches higher you reach on a running approach jump than standing flat-footed (approach reach minus standing reach).'),
  ('APPROACH_REACH', 'Approach reach: the highest point you touch at the top of a running approach jump, in inches (approach jump plus standing reach).'),
  ('BLOCK_JUMP', 'Block jump: how many inches higher you reach on a two-foot block jump than standing flat-footed (block reach minus standing reach).'),
  ('BLOCK_REACH', 'Block reach: the highest point you touch at the top of a two-foot block jump, in inches (block jump plus standing reach).'),
  ('DASH_10YD', 'Time to sprint 10 yards from a standing start, in seconds. Also the straight-line sprint used for the change-of-direction deficit (yards).'),
  ('TOP_SPEED_MPH', 'Top running speed reached during a sprint, in miles per hour.')
) AS v(code, description)
WHERE m.code = v.code
  AND (m.description IS NULL OR btrim(m.description) = '');

UPDATE site_metrics
SET unit = 'ratio', updated_at = now()
WHERE code IN ('RSI', 'RSI_SINGLE_LEFT', 'RSI_SINGLE_RIGHT', 'RSI_105')
  AND (unit IS NULL OR unit = '');

UPDATE site_metrics SET category = 'Power', updated_at = now() WHERE code IN ('RSI', 'RSI_105') AND category = 'power';

UPDATE site_metrics
SET category = 'speed', updated_at = now()
WHERE (category = 'Speed' AND code IN ('DASH_5YD', 'DASH_20YD', 'DASH_30YD', 'TOP_SPEED_MPH'))
   OR (category = 'Acceleration' AND code = 'DASH_10YD');
