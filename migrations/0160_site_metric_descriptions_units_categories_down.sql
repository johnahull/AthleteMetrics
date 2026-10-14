-- Down Migration 0160: restore the descriptions, units and categories 0160 changed
--
-- Descriptions are cleared only where they still equal the text 0160 wrote, so an edit made since survives.
-- The RSI units go back to '' (empty string), also for a database where the unit was NULL before 0160; the up treats
-- NULL and '' alike, so re-applying works. The categories go back to their earlier spellings. VERTICAL_JUMP is not
-- restored to 'power': its earlier spelling differs between databases (staging already had 'Power'), so a rollback
-- leaves it at 'Power' everywhere.
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0160.

UPDATE site_metrics AS m
SET description = NULL, updated_at = now()
FROM (VALUES
  ('APPROACH_JUMP', 'Approach jump: how many inches higher you reach on a running approach jump than standing flat-footed (approach reach minus standing reach).'),
  ('APPROACH_REACH', 'Approach reach: the highest point you touch at the top of a running approach jump, in inches (approach jump plus standing reach).'),
  ('BLOCK_JUMP', 'Block jump: how many inches higher you reach on a two-foot block jump than standing flat-footed (block reach minus standing reach).'),
  ('BLOCK_REACH', 'Block reach: the highest point you touch at the top of a two-foot block jump, in inches (block jump plus standing reach).'),
  ('DASH_10YD', 'Time to sprint 10 yards from a standing start, in seconds. Also the straight-line sprint used for the change-of-direction deficit (yards).'),
  ('TOP_SPEED_MPH', 'Top running speed reached during a sprint, in miles per hour.')
) AS v(code, description)
WHERE m.code = v.code AND m.description = v.description;

UPDATE site_metrics SET unit = '', updated_at = now()
WHERE code IN ('RSI', 'RSI_SINGLE_LEFT', 'RSI_SINGLE_RIGHT', 'RSI_105') AND unit = 'ratio';

UPDATE site_metrics SET category = 'power', updated_at = now() WHERE code IN ('RSI', 'RSI_105') AND category = 'Power';
UPDATE site_metrics SET category = 'Speed', updated_at = now()
WHERE code IN ('DASH_5YD', 'DASH_20YD', 'DASH_30YD', 'TOP_SPEED_MPH') AND category = 'speed';
UPDATE site_metrics SET category = 'Acceleration', updated_at = now() WHERE code = 'DASH_10YD' AND category = 'speed';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0160_site_metric_descriptions_units_categories';
  END IF;
END $$;
