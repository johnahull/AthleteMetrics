-- Migration 0123: Seed DASH_*M and FLY10M_TIME rows in site_metrics
--
-- The Sprint F-V protocol switched to 10/20/30/40 in both yards and meters.
-- The yards codes (DASH_10YD..DASH_40YD, FLY10_TIME) were already seeded by
-- migrations 0022 and 0107, but the meter-unit counterparts never had rows.
--
-- Without these rows the `organization_metrics` FK to `site_metrics(code)`
-- blocks any org from enabling/disabling the meter splits, so leaderboards
-- and analytics surfaces would silently omit metric-unit DashR imports.
--
-- This migration mirrors the 0107 pattern: INSERT ... ON CONFLICT DO NOTHING
-- so it is safe to run multiple times.

INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, description, decimal_precision, color, icon)
VALUES
  ('DASH_10M', '10-Meter Dash Split', 'speed', 's', 'lower_is_better', true, true, 28,
   '10-meter split time from timing gates (acceleration phase, metric-unit DashR imports).',
   3, 'indigo', 'Timer'),
  ('DASH_20M', '20-Meter Dash Split', 'speed', 's', 'lower_is_better', true, true, 29,
   '20-meter split time from timing gates (metric-unit DashR imports).',
   3, 'indigo', 'Timer'),
  ('DASH_30M', '30-Meter Dash Split', 'speed', 's', 'lower_is_better', true, true, 30,
   '30-meter split time from timing gates (metric-unit DashR imports).',
   3, 'indigo', 'Timer'),
  ('DASH_40M', '40-Meter Dash Split', 'speed', 's', 'lower_is_better', true, true, 31,
   '40-meter split time from timing gates — reaches V0 asymptote for F-V profile fitting.',
   3, 'indigo', 'Timer'),
  ('FLY10M_TIME', '10-Meter Fly Time', 'speed', 's', 'lower_is_better', true, true, 32,
   'Time to cover 10 meters after a flying start, measuring maximum velocity (metric-unit equivalent of FLY10_TIME).',
   3, 'blue', 'Clock')
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  RAISE NOTICE 'Migration 0123: Seeded 5 metric-unit site_metrics rows for Sprint F-V protocol';
END $$;
