/**
 * Self-contained pre-0144 fixture for tests/migrations (AM-FEAT-016).
 *
 * The behavioral migration tests must not depend on ambient database state
 * (a populated baseline vs. the CI database built by drizzle-kit push +
 * scripts/seed-default-metrics.ts). Inside each test's rolled-back transaction
 * this helper puts the database into ONE defined pre-0144 state:
 *
 *   - exactly the four retired site_metrics rows (AGILITY_505, _L, _R, _LSI)
 *     with their canonical production text (verbatim copy of the rows produced
 *     by migrations 0022/0107/0121/0128 on the pristine baseline DB),
 *   - DASH_10M / DASH_10YD (inserted only when absent; 0145 sources),
 *   - the 3 bench-screening-asym-lsi-* LSI tier benchmarks, the
 *     set-screening-female-bilateral-asymmetry set and its 3 set items.
 *
 * Decision (deliberate): when any of the 8 new codes already exists (the CI seed
 * creates AGILITY_505_M / AGILITY_505_YD with seed text, or the DB already ran
 * 0144), the exact 0144 DOWN file is run first, which removes the new codes and
 * restores the old ones; the old rows are then upserted to the canonical text.
 * So the pre-state never depends on what the seed or a previous migration run
 * left behind, and the up/down round trip is compared against this canonical
 * state. The caller's transaction is always rolled back.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

export const OLD_505_CODES = ['AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'];
export const NEW_505_CODES = [
  'AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI',
  'AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI',
];

const CANONICAL = {
    "site_metrics": [
        {
            "code": "AGILITY_505",
            "icon": "Zap",
            "unit": "s",
            "color": "green",
            "label": "5-0-5 Agility",
            "formula": null,
            "category": "agility",
            "is_active": true,
            "created_by": null,
            "is_derived": false,
            "description": "5-0-5 agility test: sprint 5 yards, turn 180 degrees, sprint 5 yards back.",
            "metric_type": "lower_is_better",
            "display_order": 3,
            "validation_max": null,
            "validation_min": null,
            "why_it_matters": "This test isolates single-leg change of direction ability, revealing asymmetries between legs. It's essential for sports requiring quick direction changes and reflects injury risk factors.",
            "what_it_measures": "The 5-0-5 test measures your ability to decelerate, change direction 180 degrees, and re-accelerate. You sprint 5 meters, plant and turn, then sprint back through the timing gates.",
            "decimal_precision": 3,
            "dependent_metrics": null,
            "is_system_default": true,
            "short_description": "How quickly you can stop, turn 180 degrees, and sprint back.",
            "calculation_config": null,
            "sport_associations": null,
            "available_org_types": null,
            "auxiliary_input_config": null
        },
        {
            "code": "AGILITY_505_L",
            "icon": "Zap",
            "unit": "s",
            "color": "green",
            "label": "5-0-5 Agility (Left)",
            "formula": null,
            "category": "agility",
            "is_active": true,
            "created_by": null,
            "is_derived": false,
            "description": "5-0-5 agility test turning to the left.",
            "metric_type": "lower_is_better",
            "display_order": 24,
            "validation_max": null,
            "validation_min": null,
            "why_it_matters": null,
            "what_it_measures": null,
            "decimal_precision": 3,
            "dependent_metrics": null,
            "is_system_default": true,
            "short_description": null,
            "calculation_config": null,
            "sport_associations": null,
            "available_org_types": null,
            "auxiliary_input_config": null
        },
        {
            "code": "AGILITY_505_LSI",
            "icon": "Activity",
            "unit": "%",
            "color": "green",
            "label": "5-0-5 Limb Symmetry Index",
            "formula": "(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100",
            "category": "agility",
            "is_active": true,
            "created_by": null,
            "is_derived": true,
            "description": "Limb Symmetry Index between left- and right-foot 5-0-5 turn times. Computed as (faster_leg / slower_leg) × 100. 100% = perfectly symmetric; <90% indicates clinically meaningful asymmetry and elevated lower-limb injury risk per Bishop et al., Hewett et al., and Dos'Santos et al. See cod-research-context.md §9.",
            "metric_type": "higher_is_better",
            "display_order": 40,
            "validation_max": 100.000,
            "validation_min": 0.000,
            "why_it_matters": null,
            "what_it_measures": null,
            "decimal_precision": 1,
            "dependent_metrics": [
                "AGILITY_505_L",
                "AGILITY_505_R"
            ],
            "is_system_default": true,
            "short_description": null,
            "calculation_config": {
                "dateMatchStrategy": "same_date",
                "missingSourceBehavior": "skip"
            },
            "sport_associations": null,
            "available_org_types": null,
            "auxiliary_input_config": null
        },
        {
            "code": "AGILITY_505_R",
            "icon": "Zap",
            "unit": "s",
            "color": "green",
            "label": "5-0-5 Agility (Right)",
            "formula": null,
            "category": "agility",
            "is_active": true,
            "created_by": null,
            "is_derived": false,
            "description": "5-0-5 agility test turning to the right.",
            "metric_type": "lower_is_better",
            "display_order": 25,
            "validation_max": null,
            "validation_min": null,
            "why_it_matters": null,
            "what_it_measures": null,
            "decimal_precision": 3,
            "dependent_metrics": null,
            "is_system_default": true,
            "short_description": null,
            "calculation_config": null,
            "sport_associations": null,
            "available_org_types": null,
            "auxiliary_input_config": null
        },
        {
            "code": "DASH_10M",
            "icon": "Timer",
            "unit": "s",
            "color": "indigo",
            "label": "10-Meter Dash Split",
            "formula": null,
            "category": "speed",
            "is_active": true,
            "created_by": null,
            "is_derived": false,
            "description": "10-meter split time from timing gates (acceleration phase, metric-unit DashR imports).",
            "metric_type": "lower_is_better",
            "display_order": 28,
            "validation_max": null,
            "validation_min": null,
            "why_it_matters": null,
            "what_it_measures": null,
            "decimal_precision": 3,
            "dependent_metrics": null,
            "is_system_default": true,
            "short_description": null,
            "calculation_config": null,
            "sport_associations": null,
            "available_org_types": null,
            "auxiliary_input_config": null
        },
        {
            "code": "DASH_10YD",
            "icon": "Timer",
            "unit": "s",
            "color": "indigo",
            "label": "10-Yard Dash Split",
            "formula": null,
            "category": "speed",
            "is_active": true,
            "created_by": null,
            "is_derived": false,
            "description": "10-yard split time from Dashr timing gates.",
            "metric_type": "lower_is_better",
            "display_order": 21,
            "validation_max": null,
            "validation_min": null,
            "why_it_matters": null,
            "what_it_measures": null,
            "decimal_precision": 3,
            "dependent_metrics": null,
            "is_system_default": true,
            "short_description": null,
            "calculation_config": null,
            "sport_associations": null,
            "available_org_types": null,
            "auxiliary_input_config": null
        }
    ],
    "benchmark_sets": [
        {
            "id": "set-screening-female-bilateral-asymmetry",
            "name": "Female Bilateral Asymmetry Screening",
            "level": null,
            "sport": null,
            "gender": "Female",
            "is_active": true,
            "created_by": null,
            "description": "Screening tiers for AGILITY_505_LSI applying to female athletes in soccer and volleyball. Tiers reflect clinical injury-risk thresholds, not competitive levels. Sources: Bishop et al. (LSI cutoffs in athletic populations), Hewett et al. (prospective ACL injury studies), Dos'Santos et al. (180° turn biomechanics). See cod-research-context.md §9.",
            "is_template": true,
            "organization_id": null
        }
    ],
    "site_benchmarks": [
        {
            "id": "bench-screening-asym-lsi-elevated",
            "icon": null,
            "name": "LSI Elevated Risk (<90%)",
            "color": null,
            "level": null,
            "sport": null,
            "gender": "Female",
            "age_max": null,
            "age_min": null,
            "position": null,
            "is_active": true,
            "max_value": 89.999,
            "min_value": 0.000,
            "tier_name": "Elevated Risk",
            "created_by": null,
            "tier_color": "red",
            "tier_order": 3,
            "description": "LSI < 90% — clinically meaningful asymmetry. Targeted unilateral strength on weak side; do not progress to high-intensity reactive work until corrected. Sources: Bishop, Hewett, Dos'Santos.",
            "metric_code": "AGILITY_505_LSI",
            "coaching_note": null,
            "display_order": 3,
            "tier_group_id": "a505a505-0128-4505-9151-aaaaaaaaaaaa",
            "benchmark_value": null,
            "benchmark_source": "static",
            "is_system_default": true,
            "comparison_operator": "range",
            "applicable_org_types": null,
            "peer_filter_criteria": null,
            "peer_percentile_target": null
        },
        {
            "id": "bench-screening-asym-lsi-monitor",
            "icon": null,
            "name": "LSI Monitor (90-95%)",
            "color": null,
            "level": null,
            "sport": null,
            "gender": "Female",
            "age_max": null,
            "age_min": null,
            "position": null,
            "is_active": true,
            "max_value": 94.999,
            "min_value": 90.000,
            "tier_name": "Monitor",
            "created_by": null,
            "tier_color": "yellow",
            "tier_order": 2,
            "description": "LSI 90–95%. Borderline; bias bilateral loading toward weak side. Source: Bishop et al.",
            "metric_code": "AGILITY_505_LSI",
            "coaching_note": null,
            "display_order": 2,
            "tier_group_id": "a505a505-0128-4505-9151-aaaaaaaaaaaa",
            "benchmark_value": null,
            "benchmark_source": "static",
            "is_system_default": true,
            "comparison_operator": "range",
            "applicable_org_types": null,
            "peer_filter_criteria": null,
            "peer_percentile_target": null
        },
        {
            "id": "bench-screening-asym-lsi-normal",
            "icon": null,
            "name": "LSI Normal (>=95%)",
            "color": null,
            "level": null,
            "sport": null,
            "gender": "Female",
            "age_max": null,
            "age_min": null,
            "position": null,
            "is_active": true,
            "max_value": 100.000,
            "min_value": 95.000,
            "tier_name": "Normal",
            "created_by": null,
            "tier_color": "green",
            "tier_order": 1,
            "description": "LSI ≥ 95%. Within expected range; continue programming. Source: Bishop et al.",
            "metric_code": "AGILITY_505_LSI",
            "coaching_note": null,
            "display_order": 1,
            "tier_group_id": "a505a505-0128-4505-9151-aaaaaaaaaaaa",
            "benchmark_value": null,
            "benchmark_source": "static",
            "is_system_default": true,
            "comparison_operator": "range",
            "applicable_org_types": null,
            "peer_filter_criteria": null,
            "peer_percentile_target": null
        }
    ],
    "benchmark_set_items": [
        {
            "id": "bsi-screening-asym-lsi-elevated",
            "set_id": "set-screening-female-bilateral-asymmetry",
            "benchmark_id": "bench-screening-asym-lsi-elevated",
            "custom_label": null,
            "display_order": 3,
            "benchmark_type": "site"
        },
        {
            "id": "bsi-screening-asym-lsi-monitor",
            "set_id": "set-screening-female-bilateral-asymmetry",
            "benchmark_id": "bench-screening-asym-lsi-monitor",
            "custom_label": null,
            "display_order": 2,
            "benchmark_type": "site"
        },
        {
            "id": "bsi-screening-asym-lsi-normal",
            "set_id": "set-screening-female-bilateral-asymmetry",
            "benchmark_id": "bench-screening-asym-lsi-normal",
            "custom_label": null,
            "display_order": 1,
            "benchmark_type": "site"
        }
    ]
} as const;

function lit(v: unknown): string {
  return `$cj$${JSON.stringify(v)}$cj$`;
}

async function putRow(tx: Tx, table: string, row: Record<string, unknown>, key: string, overwrite: boolean) {
  const cols = Object.keys(row);
  const sets = cols.filter((c) => c !== key).map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  await tx.unsafe(
    `insert into ${table} (${cols.join(', ')})
     select ${cols.join(', ')} from jsonb_populate_recordset(null::${table}, ${lit([row])}::jsonb)
     on conflict (${key}) ${overwrite ? `do update set ${sets}` : 'do nothing'}`,
  );
}

/**
 * Bring the (transactional) database to the canonical pre-0144 state.
 * downSql: contents of migrations/0144_split_505_by_protocol_down.sql.
 */
export async function ensurePre0144State(tx: Tx, downSql: string): Promise<void> {
  const [{ n }] = await tx`select count(*)::int as n from site_metrics where code ~ '^AGILITY_505_(M|YD)'`;
  // 0144_down refuses while 0145 is applied (its formulas reference the legs): remove the deficits first.
  await tx`delete from site_metrics where code in ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD')`;
  if (n > 0) await tx.unsafe(downSql);

  // Old rows: upsert to the canonical text so the pre-state is deterministic.
  for (const row of CANONICAL.site_metrics) {
    await putRow(tx, 'site_metrics', row, 'code', OLD_505_CODES.includes(row.code));
  }
  for (const row of CANONICAL.site_benchmarks) await putRow(tx, 'site_benchmarks', row, 'id', false);
  for (const row of CANONICAL.benchmark_sets) await putRow(tx, 'benchmark_sets', row, 'id', false);
  for (const row of CANONICAL.benchmark_set_items) await putRow(tx, 'benchmark_set_items', row, 'id', false);

  const [{ bad }] = await tx`select count(*)::int as bad from site_metrics where code = any(${NEW_505_CODES})`;
  if (bad !== 0) throw new Error('ensurePre0144State: new 5-0-5 codes still present after the down migration');
  const [{ old }] = await tx`select count(*)::int as old from site_metrics where code = any(${OLD_505_CODES})`;
  if (old !== 4) throw new Error('ensurePre0144State: expected the 4 retired 5-0-5 site_metrics rows');
}

/**
 * numeric scale of site_benchmarks.min_value / max_value. Migration-built databases
 * (production, the baseline) have scale 3; a drizzle-kit push database (PR CI) is built
 * from packages/shared/schema.ts, where these two columns are scale 2, so 3-decimal
 * thresholds are rounded to 2 decimals on store. Tests that assert stored threshold
 * values use this to state the expectation for the DB they run on.
 */
export async function benchmarkMinMaxScale(tx: Tx): Promise<number> {
  const [{ s }] = await tx`select numeric_scale::int as s from information_schema.columns
                            where table_name = 'site_benchmarks' and column_name = 'min_value'`;
  return s as number;
}
