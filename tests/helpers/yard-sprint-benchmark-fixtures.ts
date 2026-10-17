/**
 * Fixtures for the AM-FEAT-022 tests: the production state of the Female SOCCER yard-sprint benchmark rows
 * (values and descriptions selected read-only from prod on 2026-10-17, identical to 0129 / 0132), the rows the
 * migration must leave alone, and an upsert that writes them on any database shape (CI: db:push + seed, no
 * benchmark rows; or migrated). Everything is meant to run inside a rolled-back transaction.
 */
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';

export interface Row {
  code: string;
  name: string;
  tier: string;
  level: string;
  ageMin: number | null;
  ageMax: number | null;
  value: number;
  description: string;
  // expected after the migration
  newValue: number;
  newActive: boolean;
  newDescription: boolean; // true when the description is rewritten
}

const D1 = { level: 'D1', ageMin: null, ageMax: null } as const;
const DII = { level: 'DII', ageMin: null, ageMax: null } as const;
const DIII = { level: 'DIII', ageMin: null, ageMax: null } as const;
const MS = { level: 'HS', ageMin: 11, ageMax: 13 } as const;
const JV = { level: 'HS', ageMin: 14, ageMax: 15 } as const;
const VAR = { level: 'HS', ageMin: 16, ageMax: 18 } as const;
export const VAR_NAME = 'HS Varsity Female Soccer (Ages 16-18)';

/** The 15 rows the migration touches: prod state first, expected state after. */
export const CHANGED: Row[] = [
  { code: 'DASH_20YD', name: 'Soccer D1 Average', tier: 'D1 Average', ...D1, value: 3.12, description: 'Mid of 3.05-3.20 (Lockie 30m derived); externally corroborated by recruiting standards. Confidence: MEDIUM-HIGH.', newValue: 3.33, newActive: true, newDescription: true },
  { code: 'DASH_30YD', name: 'Soccer D1 Average', tier: 'D1 Average', ...D1, value: 4.2, description: '~4.20s. Stankovic 2025 (national-team-selected female 30m: 4.49-4.78s × 0.914 yd conversion). Confidence: MEDIUM.', newValue: 4.61, newActive: true, newDescription: true },
  { code: 'DASH_40YD', name: 'Soccer D1 Average', tier: 'D1 Average', ...D1, value: 5.1, description: '~5.10s. Aggregated US recruiting data (NCSA, college program data). Confidence: MEDIUM-HIGH.', newValue: 5.85, newActive: true, newDescription: true },
  { code: 'DASH_40YD', name: 'Soccer D1 Top 25%', tier: 'D1 Top 25%', ...D1, value: 4.95, description: '~4.95s. Sub-5.0s = recruiting elite threshold; All-American level. Confidence: MEDIUM-HIGH.', newValue: 5.7, newActive: true, newDescription: true },
  { code: 'DASH_40YD', name: 'HS MS Female Soccer (Ages 11-13) Average', tier: 'MS Average', ...MS, value: 6.3, description: '~6.30s. Confidence: LOW — estimated, pending BTA internal data.', newValue: 6.15, newActive: true, newDescription: true },
  { code: 'DASH_40YD', name: 'HS JV Female Soccer (Ages 14-15) Average', tier: 'JV Average', ...JV, value: 5.85, description: '~5.85s. Confidence: MEDIUM.', newValue: 5.94, newActive: true, newDescription: true },
  { code: 'DASH_40YD', name: `${VAR_NAME} Average`, tier: 'Varsity Average', ...VAR, value: 5.5, description: '~5.50s. Confidence: MEDIUM.', newValue: 5.9, newActive: true, newDescription: true },
  // Switched off: value and description stay as they are
  { code: 'DASH_20YD', name: 'Soccer D1 Top 25%', tier: 'D1 Top 25%', ...D1, value: 2.95, description: 'Auburn extrapolated. Confidence: MEDIUM.', newValue: 2.95, newActive: false, newDescription: false },
  { code: 'DASH_30YD', name: 'Soccer D1 Top 25%', tier: 'D1 Top 25%', ...D1, value: 4.05, description: '~4.05s. Extrapolated from D1 elite 30m thresholds. Confidence: MEDIUM-LOW.', newValue: 4.05, newActive: false, newDescription: false },
  { code: 'DASH_30YD', name: `${VAR_NAME} Average`, tier: 'Varsity Average', ...VAR, value: 4.4, description: '~4.40s. Confidence: MEDIUM.', newValue: 4.4, newActive: false, newDescription: false },
  { code: 'DASH_40YD', name: `${VAR_NAME} Top 25%`, tier: 'Varsity Top 25%', ...VAR, value: 5.2, description: '~5.20s. Approaches D1 Average — high-tier HS achievable. Confidence: MEDIUM.', newValue: 5.2, newActive: false, newDescription: false },
  { code: 'DASH_30YD', name: 'Soccer DII Threshold', tier: 'DII Threshold', ...DII, value: 4.3, description: '< 4.30s. Extrapolated from D1 thresholds. Confidence: MEDIUM.', newValue: 4.3, newActive: false, newDescription: false },
  { code: 'DASH_40YD', name: 'Soccer DII Threshold', tier: 'DII Threshold', ...DII, value: 5.3, description: '< 5.30s. NCSA recruiting standards. Confidence: MEDIUM-HIGH.', newValue: 5.3, newActive: false, newDescription: false },
  { code: 'DASH_30YD', name: 'Soccer DIII Threshold', tier: 'DIII Threshold', ...DIII, value: 4.5, description: '< 4.50s. Extrapolated. Confidence: MEDIUM.', newValue: 4.5, newActive: false, newDescription: false },
  { code: 'DASH_40YD', name: 'Soccer DIII Threshold', tier: 'DIII Threshold', ...DIII, value: 5.6, description: '< 5.60s. NCSA recruiting standards. Confidence: MEDIUM-HIGH.', newValue: 5.6, newActive: false, newDescription: false },
];

/** Rows that must come out byte-identical. */
export const UNTOUCHED: (Omit<Row, 'newValue' | 'newActive' | 'newDescription'> & { op?: string })[] = [
  { code: 'DASH_10YD', name: 'Soccer D1 Average', tier: 'D1 Average', ...D1, value: 1.87, description: 'ten yd d1' },
  { code: 'DASH_10YD', name: 'Soccer D1 Top 25%', tier: 'D1 Top 25%', ...D1, value: 1.65, description: 'ten yd d1 top' },
  { code: 'DASH_20YD', name: 'Soccer DII Threshold', tier: 'DII Threshold', ...DII, value: 3.2, description: '< 3.20s. Extrapolated from D1 thresholds. Confidence: MEDIUM.' },
  { code: 'DASH_20YD', name: 'Soccer DIII Threshold', tier: 'DIII Threshold', ...DIII, value: 3.3, description: '< 3.30s. Extrapolated. Confidence: MEDIUM.' },
  { code: 'DASH_20YD', name: 'HS MS Female Soccer (Ages 11-13) Average', tier: 'MS Average', ...MS, value: 3.85, description: 'PMC8381494 + extrapolation. Confidence: MEDIUM.' },
  { code: 'DASH_20YD', name: 'HS JV Female Soccer (Ages 14-15) Average', tier: 'JV Average', ...JV, value: 3.65, description: 'PMC8381494 + extrapolation. Confidence: MEDIUM.' },
  { code: 'DASH_20YD', name: `${VAR_NAME} Average`, tier: 'Varsity Average', ...VAR, value: 3.5, description: 'PMC8381494 + Vescovi 2012. Confidence: MEDIUM.' },
  { code: 'DASH_30YD', name: 'HS MS Female Soccer (Ages 11-13) Average', tier: 'MS Average', ...MS, value: 5.1, description: '~5.10s. Confidence: LOW' },
  { code: 'DASH_30YD', name: 'HS JV Female Soccer (Ages 14-15) Average', tier: 'JV Average', ...JV, value: 4.7, description: '~4.70s. Confidence: MEDIUM.' },
  { code: 'DASH_10YD', name: 'HS MS Female Soccer (Ages 11-13) Average', tier: 'MS Average', ...MS, value: 2.15, description: 'ten yd ms' },
  { code: 'DASH_10YD', name: 'HS JV Female Soccer (Ages 14-15) Average', tier: 'JV Average', ...JV, value: 2.05, description: 'ten yd jv' },
  { code: 'DASH_10YD', name: `${VAR_NAME} Average`, tier: 'Varsity Average', ...VAR, value: 1.95, description: 'ten yd var' },
  { code: 'FLY10_TIME', name: 'Soccer D1 Average', tier: 'D1 Average', ...D1, value: 1.2, description: 'fly' },
  { code: 'AGILITY_505_M', name: 'Soccer D1 Average', tier: 'D1 Average', ...D1, value: 2.6, description: 'five-o-five d1' },
  { code: 'AGILITY_505_M', name: `${VAR_NAME} Average`, tier: 'Varsity Average', ...VAR, value: 2.75, description: 'five-o-five var' },
  { code: 'JUMP_CMJ_HOH', name: 'Soccer D1 Average', tier: 'D1 Average', ...D1, value: 40, description: 'cmj d1', op: 'gte' },
  { code: 'JUMP_CMJ_HOH', name: `${VAR_NAME} Average`, tier: 'Varsity Average', ...VAR, value: 35, description: 'cmj var', op: 'gte' },
];

/** Same shape, other sex or sport: the migration must not reach them. */
export const OTHER = [
  { code: 'DASH_40YD', name: 'T0164 Male Soccer D1 Average', gender: 'Male', sport: 'SOCCER' },
  { code: 'DASH_40YD', name: 'T0164 Female Volleyball D1 Average', gender: 'Female', sport: 'VOLLEYBALL' },
];

export const ALL_CODES = ['DASH_10YD', 'DASH_20YD', 'DASH_30YD', 'DASH_40YD', 'FLY10_TIME', 'AGILITY_505_M', 'JUMP_CMJ_HOH'];

export async function upsert(tx: any, r: { code: string; name: string; tier?: string; level?: string | null; ageMin?: number | null; ageMax?: number | null; value: number; description: string; gender?: string; sport?: string; op?: string }) {
  await tx.execute(sql`
    INSERT INTO site_benchmarks (id, metric_code, name, description, comparison_operator, benchmark_value, tier_name,
                                 gender, sport, level, age_min, age_max, is_system_default, is_active)
    VALUES (${randomUUID()}, ${r.code}, ${r.name}, ${r.description}, ${r.op ?? 'lte'}, ${r.value}, ${r.tier ?? null},
            ${r.gender ?? 'Female'}, ${r.sport ?? 'SOCCER'}, ${r.level ?? 'D1'}, ${r.ageMin ?? null}, ${r.ageMax ?? null}, true, true)
    ON CONFLICT (metric_code, name) DO UPDATE SET
      description = EXCLUDED.description, benchmark_value = EXCLUDED.benchmark_value, tier_name = EXCLUDED.tier_name,
      comparison_operator = EXCLUDED.comparison_operator,
      gender = EXCLUDED.gender, sport = EXCLUDED.sport, level = EXCLUDED.level,
      age_min = EXCLUDED.age_min, age_max = EXCLUDED.age_max, is_active = true`);
}

/** The production state of the 15 rows, the untouched rows, and the other-sex / other-sport rows. */
export async function baseline(tx: any) {
  for (const r of CHANGED) await upsert(tx, r);
  for (const r of UNTOUCHED) await upsert(tx, r);
  for (const o of OTHER) await upsert(tx, { ...o, tier: 'D1 Average', level: 'D1', value: 5.1, description: 'other' });
}

