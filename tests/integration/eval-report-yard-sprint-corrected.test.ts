/**
 * AM-FEAT-022: what the eval report shows for the women's-soccer 20 / 30 / 40 yd sprints before and after
 * migration 0164. Users, event, measurements, benchmark rows and the migration all run inside one transaction
 * that is rolled back, and loadEvalReportInputs / assembleEvalReportModel read through it.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { assembleEvalReportModel, loadEvalReportInputs } from '../../packages/api/services/eval-report-service';
import { events, measurements, organizations, userOrganizations, users } from '@shared/schema';
import { ALL_CODES, baseline } from '../helpers/yard-sprint-benchmark-fixtures';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UP = fs.readFileSync(path.resolve(__dirname, '../../migrations/0164_correct_yard_sprint_benchmarks.sql'), 'utf-8');

class Rollback extends Error {}

const EVENT_DATE = '2026-05-01';
// Born so that the age at the event is 12, 15, 17 and 20
const BIRTH: Record<number, string> = { 12: '2014-01-15', 15: '2011-01-15', 17: '2009-01-15', 20: '2006-01-15' };
const HIGHER_IS_BETTER = new Set(['JUMP_CMJ_HOH']);

/** One athlete's measurements: the three yard sprints plus the four metrics that must not change. */
const VALUES: Record<string, number> = {
  DASH_10YD: 1.9, DASH_20YD: 3.3, DASH_30YD: 4.7, DASH_40YD: 6.0, FLY10_TIME: 1.25, AGILITY_505_M: 2.7, JUMP_CMJ_HOH: 38,
};
const UNCHANGED = ['DASH_10YD', 'FLY10_TIME', 'AGILITY_505_M', 'JUMP_CMJ_HOH'];

async function inRolledBackTx(fn: (tx: any) => Promise<void>) {
  try {
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`);
      for (const code of ALL_CODES) {
        await tx.execute(sql`
          INSERT INTO site_metrics (code, label, category, unit, metric_type)
          VALUES (${code}, ${code}, 'speed', ${code === 'JUMP_CMJ_HOH' ? 'in' : 's'},
                  ${HIGHER_IS_BETTER.has(code) ? 'higher_is_better' : 'lower_is_better'})
          ON CONFLICT (code) DO NOTHING`);
      }
      await baseline(tx);
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/** Create the org, event and one verified athlete per age; returns a model builder keyed by age. */
async function setup(tx: any, overrides: Partial<Record<string, number>> = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const [{ id: orgId }] = await tx.insert(organizations).values({ name: `T0164 Org ${suffix}` }).returning();
  const [{ id: eventId }] = await tx
    .insert(events)
    .values({ organizationId: orgId, name: `T0164 ${suffix}`, startDate: new Date(`${EVENT_DATE}T00:00:00Z`) } as any)
    .returning({ id: events.id });
  const ids: Record<number, string> = {};
  for (const age of [12, 15, 17, 20]) {
    const [{ id }] = await tx
      .insert(users)
      .values({
        username: `t0164-${age}-${suffix}`, emails: [`t0164-${age}-${suffix}@test.com`], password: 'x',
        firstName: 'T', lastName: `Age${age}`, fullName: `T Age${age}`, birthDate: BIRTH[age],
        gender: 'Female', sports: ['SOCCER'],
      } as any)
      .returning();
    ids[age] = id;
    await tx.insert(userOrganizations).values({ userId: id, organizationId: orgId, role: 'athlete' } as any);
    const values = { ...VALUES, ...(age === 20 ? { DASH_40YD: 5.55 } : {}), ...overrides };
    await tx.insert(measurements).values(
      Object.entries(values).map(([metric, value]) => ({
        userId: id, submittedBy: id, date: EVENT_DATE, age, metric, value: String(value), units: metric === 'JUMP_CMJ_HOH' ? 'in' : 's',
        isVerified: true, eventId, organizationId: orgId,
      })) as any,
    );
  }
  const [event] = await tx.select().from(events).where(sql`${events.id} = ${eventId}`);
  const model = async (age: number) => {
    const inputs = await loadEvalReportInputs(tx, { event, athleteId: ids[age] });
    const built = assembleEvalReportModel({
      ...inputs,
      selection: { metricKeys: Object.keys(VALUES), collegeGauge: true },
      load: null, coachNote: null, overrides: {},
    });
    return { inputs, metric: (code: string) => built.metrics.find((m) => m.code === code)! };
  };
  return { model };
}

describe('eval report: women\'s soccer yard sprints (AM-FEAT-022)', () => {
  it('before 0164 a 5.55 s electronic 40 yd at age 20 reads below the seeded D1 average (the bug)', async () => {
    await inRolledBackTx(async (tx) => {
      const { model } = await setup(tx);
      const m = (await model(20)).metric('DASH_40YD');
      expect(m.collegeStandard?.averageValue).toBe(5.1);
      expect(m.collegeStandard?.status).toBe('below');
    });
  });

  it('after 0164 the same athlete reads above the D1 average of 5.85, with 20 and 30 yd on the new averages', async () => {
    await inRolledBackTx(async (tx) => {
      const { model } = await setup(tx);
      await tx.execute(sql.raw(UP));
      const a = await model(20);
      expect(a.metric('DASH_40YD').collegeStandard).toMatchObject({ averageValue: 5.85, operator: 'lte', status: 'at_or_better' });
      expect(a.metric('DASH_30YD').collegeStandard?.averageValue).toBe(4.61);
      expect(a.metric('DASH_20YD').collegeStandard?.averageValue).toBe(3.33);
      expect(a.metric('DASH_40YD').comparison).toBeNull(); // 20 is above the age-group range
    });
  });

  it('ages 12 / 15 / 17 compare the 40 yd to 6.15 / 5.94 / 5.90', async () => {
    await inRolledBackTx(async (tx) => {
      const { model } = await setup(tx);
      await tx.execute(sql.raw(UP));
      for (const [age, expected] of [[12, 6.15], [15, 5.94], [17, 5.9]] as const) {
        const c = (await model(age)).metric('DASH_40YD').comparison;
        expect(c, `age ${age}`).toMatchObject({ kind: 'average', averageValue: expected });
      }
    });
  });

  it('Varsity 30 yd, DII / DIII 30 and 40 yd and D1 Top 25% 20 / 30 yd give no tier and no error', async () => {
    await inRolledBackTx(async (tx) => {
      const { model } = await setup(tx);
      await tx.execute(sql.raw(UP));
      const a17 = await model(17);
      expect(a17.metric('DASH_30YD').comparison).toBeNull();
      expect(a17.metric('DASH_30YD').value).toBe(4.7);

      // The loader hands the report only active rows, so the switched-off rows are not candidates at all
      const offered = a17.inputs.benchmarks.map((b) => `${b.metricCode}|${b.level}|${b.tierName}`);
      for (const gone of [
        'DASH_30YD|DII|DII Threshold', 'DASH_40YD|DII|DII Threshold', 'DASH_30YD|DIII|DIII Threshold', 'DASH_40YD|DIII|DIII Threshold',
        'DASH_20YD|D1|D1 Top 25%', 'DASH_30YD|D1|D1 Top 25%', 'DASH_40YD|HS|Varsity Top 25%', 'DASH_30YD|HS|Varsity Average',
      ]) {
        expect(offered, gone).not.toContain(gone);
      }
      // Every age still builds a model without throwing
      for (const age of [12, 15, 17, 20]) expect((await model(age)).metric('DASH_40YD').value).toBeGreaterThan(0);
    });
  });

  it('10 yd, fly 10, 5-0-5 and CMJ hands-on-hips gauges are identical before and after 0164', async () => {
    await inRolledBackTx(async (tx) => {
      const { model } = await setup(tx);
      const read = async () => {
        const out: Record<string, unknown> = {};
        for (const age of [12, 15, 17, 20]) {
          const built = await model(age);
          for (const code of UNCHANGED) {
            const m = built.metric(code);
            out[`${age}|${code}`] = { comparison: m.comparison, collegeStandard: m.collegeStandard };
          }
        }
        return out;
      };
      const before = await read();
      await tx.execute(sql.raw(UP));
      const after = await read();
      expect(after).toEqual(before);
      // not vacuous: gauges exist
      expect((before['15|DASH_10YD'] as any).comparison).not.toBeNull();
      expect((before['20|FLY10_TIME'] as any).collegeStandard).not.toBeNull();
      expect((before['17|AGILITY_505_M'] as any).comparison).not.toBeNull();
      expect((before['17|JUMP_CMJ_HOH'] as any).comparison).not.toBeNull();
    });
  });
});
