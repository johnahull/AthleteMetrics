-- Migration 0167: rename the EUR / RSI tier benchmarks seeded by 0137 to "<Group> - <Tier>"
--
-- The tier group label is derived from the first tier's name by stripping a trailing " - Segment"
-- (deriveTierGroupName). The 16 rows seeded by 0137 had no " - ", so the athlete profile labelled every EUR
-- athlete "EUR Elite Reactive (>1.25):", even next to a Concentric-dominant badge.
-- New names use an en dash inside ranges and no hyphen after " - ", so every tier row derives the same group:
-- EUR, RSI Left, RSI Right, RSI Asymmetry.
-- Renamed: 16 site_benchmarks rows, by id, only while they still carry the 0137 name.
-- Not touched: tier_name, values, coaching notes, set items, measurements.
-- Re-running 0137 after this rename fails on the primary key (its ON CONFLICT is on (metric_code, name)),
-- so 0137 must not be replayed on a migrated DB.
-- Idempotent. Reversible: 0167_rename_eur_rsi_tier_groups_down.sql (restores the 0137 names).
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT here.

DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE site_benchmarks b
     SET name = v.new_name, updated_at = NOW()
    FROM (VALUES
      ('bench-eur-elite-reactive',      'EUR Elite Reactive (>1.25)',         'EUR - Elite Reactive (>1.25)'),
      ('bench-eur-trained-reactive',    'EUR Trained Reactive (1.15-1.25)',   'EUR - Trained Reactive (1.15–1.25)'),
      ('bench-eur-functional-ssc',      'EUR Functional SSC Use (1.05-1.15)', 'EUR - Functional SSC Use (1.05–1.15)'),
      ('bench-eur-concentric-dominant', 'EUR Concentric-Dominant (<1.05)',    'EUR - Concentric Dominant (<1.05)'),
      ('bench-rsi-l-elite',             'RSI_L Elite (≥1.5)',                 'RSI Left - Elite (≥1.5)'),
      ('bench-rsi-l-trained',           'RSI_L Trained (1.1-1.5)',            'RSI Left - Trained (1.1–1.5)'),
      ('bench-rsi-l-general',           'RSI_L General (0.5-1.1)',            'RSI Left - General (0.5–1.1)'),
      ('bench-rsi-l-floor',             'RSI_L Below Floor (<0.5)',           'RSI Left - Below Floor (<0.5)'),
      ('bench-rsi-r-elite',             'RSI_R Elite (≥1.5)',                 'RSI Right - Elite (≥1.5)'),
      ('bench-rsi-r-trained',           'RSI_R Trained (1.1-1.5)',            'RSI Right - Trained (1.1–1.5)'),
      ('bench-rsi-r-general',           'RSI_R General (0.5-1.1)',            'RSI Right - General (0.5–1.1)'),
      ('bench-rsi-r-floor',             'RSI_R Below Floor (<0.5)',           'RSI Right - Below Floor (<0.5)'),
      ('bench-rsi-asym-symmetric',      'RSI Symmetrical (<10%)',             'RSI Asymmetry - Symmetrical (<10%)'),
      ('bench-rsi-asym-borderline',     'RSI Borderline (10-15%)',            'RSI Asymmetry - Borderline (10–15%)'),
      ('bench-rsi-asym-significant',    'RSI Significant Deficit (15-20%)',   'RSI Asymmetry - Significant Deficit (15–20%)'),
      ('bench-rsi-asym-redflag',        'RSI Clinical Red Flag (>20%)',       'RSI Asymmetry - Clinical Red Flag (>20%)')
    ) AS v(id, old_name, new_name)
   WHERE b.id = v.id
     AND b.name = v.old_name
     AND NOT EXISTS (SELECT 1 FROM site_benchmarks x WHERE x.metric_code = b.metric_code AND x.name = v.new_name);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Migration 0167: renamed % EUR / RSI tier benchmarks', v_count;
END $$;
