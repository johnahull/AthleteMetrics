-- Migration 0030: Improve seed data idempotency
-- Description: Changes seed data conflict resolution from ID-based to semantic (metric_code + name)
-- Created: 2025-11-04
-- Dependencies: 0024_add_benchmarks_system.sql

-- Drop and recreate seed data with semantic conflict resolution
-- This allows updating seed data values (description, benchmark_value, etc.) while preserving IDs

-- First, ensure we have a unique constraint on (metric_code, name) for semantic matching
-- This constraint likely already exists from the schema, but we'll make it explicit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'site_benchmarks_metric_name_unique'
  ) THEN
    ALTER TABLE site_benchmarks
    ADD CONSTRAINT site_benchmarks_metric_name_unique UNIQUE (metric_code, name);
  END IF;
END $$;

-- Update seed data with idempotent upsert (semantic conflict resolution)
INSERT INTO site_benchmarks (id, metric_code, name, description, benchmark_value, comparison_operator, is_system_default, is_active, display_order, color, icon, gender, age_min, age_max, level)
VALUES
  -- 10-Yard Fly Time benchmarks (lower is better)
  ('00000000-0000-0000-0000-000000000001', 'FLY10_TIME', 'Elite Speed', 'Elite-level 10-yard fly time', 1.00, 'lte', true, true, 1, 'emerald', 'Zap', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000000002', 'FLY10_TIME', 'College Level', 'College-level 10-yard fly time', 1.20, 'lte', true, true, 2, 'blue', 'Target', NULL, NULL, NULL, 'College'),

  -- Vertical Jump benchmarks (higher is better)
  ('00000000-0000-0000-0000-000000000003', 'VERTICAL_JUMP', 'Elite Power', 'Elite-level vertical jump height', 32.0, 'gte', true, true, 3, 'purple', 'TrendingUp', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000000004', 'VERTICAL_JUMP', 'College Level', 'College-level vertical jump height', 26.0, 'gte', true, true, 4, 'indigo', 'Target', NULL, NULL, NULL, 'College'),

  -- 40-Yard Dash benchmarks (lower is better)
  ('00000000-0000-0000-0000-000000000005', 'DASH_40YD', 'Elite Speed', 'Elite-level 40-yard dash time', 4.50, 'lte', true, true, 5, 'red', 'Zap', NULL, NULL, NULL, NULL),
  ('00000000-0000-0000-0000-000000000006', 'DASH_40YD', 'College Level', 'College-level 40-yard dash time', 5.00, 'lte', true, true, 6, 'orange', 'Target', NULL, NULL, NULL, 'College')
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  benchmark_value = EXCLUDED.benchmark_value,
  comparison_operator = EXCLUDED.comparison_operator,
  display_order = EXCLUDED.display_order,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  gender = EXCLUDED.gender,
  age_min = EXCLUDED.age_min,
  age_max = EXCLUDED.age_max,
  level = EXCLUDED.level,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 0030: Seed data now uses semantic conflict resolution (metric_code, name)';
END $$;
