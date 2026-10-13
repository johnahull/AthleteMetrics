import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    // Rows the org-membership lookup returns (a real query only returns org members)
    members: [] as Array<{ id: string; fullName: string }>,
    insertCalls: [] as any[][],
    failInsert: false,
  };
  const db = {
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: async () => state.members }) }),
    }),
    insert: () => ({
      values: (v: any) => ({
        returning: async () => {
          if (state.failInsert) throw new Error('insert boom');
          const rows = Array.isArray(v) ? v : [v];
          state.insertCalls.push(rows);
          return rows.map((r, i) => ({ id: `r${i}`, ...r }));
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock('../../db', () => ({ db: h.db }));

import { createReportsFromInput, ReportCreateError } from '../report-create';

const timeframe = { type: 'custom', customStart: '2026-01-01', customEnd: '2026-02-01' };
const base = { name: 'Combine', organizationId: 'org1', description: undefined, isTemplate: false };
const individual = (config: Record<string, unknown>) =>
  ({ ...base, reportType: 'individual', config: { timeframe, metrics: [], ...config } }) as any;

describe('createReportsFromInput', () => {
  beforeEach(() => {
    h.state.members = [];
    h.state.insertCalls = [];
    h.state.failInsert = false;
  });

  it('creates one report per athlete in a single insert, with athleteId and name suffix', async () => {
    h.state.members = [{ id: 'a1', fullName: 'Ann' }, { id: 'a2', fullName: 'Bob' }];
    const res = await createReportsFromInput('u1', individual({ eventId: 'e1', athleteIds: ['a1', 'a2'] }));

    expect(res.kind).toBe('batch');
    expect(h.state.insertCalls).toHaveLength(1);
    const rows = h.state.insertCalls[0];
    expect(rows.map((r) => r.name)).toEqual(['Combine - Ann', 'Combine - Bob']);
    expect(rows.map((r) => r.config.athleteId)).toEqual(['a1', 'a2']);
    expect(rows[0].config.athleteIds).toBeUndefined();
    expect(rows[0].config.eventId).toBe('e1');
    expect(rows[0].createdBy).toBe('u1');
    if (res.kind === 'batch') {
      expect(res.reports.map((r) => r.athleteName)).toEqual(['Ann', 'Bob']);
    }
  });

  it('rejects athlete ids that are unknown or outside the organization, and inserts nothing', async () => {
    h.state.members = [{ id: 'a1', fullName: 'Ann' }];
    const err = await createReportsFromInput('u1', individual({ athleteIds: ['a1', 'ghost'] })).catch((e) => e);

    expect(err).toBeInstanceOf(ReportCreateError);
    expect(err.status).toBe(400);
    expect(err.body.missingIds).toEqual(['ghost']);
    expect(h.state.insertCalls).toHaveLength(0);
  });

  it('ignores duplicate athlete ids', async () => {
    h.state.members = [{ id: 'a1', fullName: 'Ann' }];
    const res = await createReportsFromInput('u1', individual({ athleteIds: ['a1', 'a1'] }));

    expect(res.kind).toBe('batch');
    expect(h.state.insertCalls[0]).toHaveLength(1);
  });

  it('treats a lone athleteId like a one-athlete list and validates it', async () => {
    h.state.members = [];
    const err = await createReportsFromInput('u1', individual({ athleteId: 'ghost' })).catch((e) => e);
    expect(err).toBeInstanceOf(ReportCreateError);
    expect(err.body.missingIds).toEqual(['ghost']);

    h.state.members = [{ id: 'a1', fullName: 'Ann' }];
    const res = await createReportsFromInput('u1', individual({ athleteId: 'a1' }));
    expect(res.kind).toBe('batch');
    expect(h.state.insertCalls[0][0].config.athleteId).toBe('a1');
  });

  it.each([
    ['no athlete keys', {}],
    ['an empty athleteIds list', { athleteIds: [] }],
  ])('rejects an individual report with %s', async (_label, config) => {
    const err = await createReportsFromInput('u1', individual(config)).catch((e) => e);
    expect(err).toBeInstanceOf(ReportCreateError);
    expect(err.status).toBe(400);
    expect(h.state.insertCalls).toHaveLength(0);
  });

  it('lets a failed insert propagate with nothing persisted (one statement, no partial batch)', async () => {
    h.state.members = [{ id: 'a1', fullName: 'Ann' }, { id: 'a2', fullName: 'Bob' }];
    h.state.failInsert = true;
    await expect(createReportsFromInput('u1', individual({ athleteIds: ['a1', 'a2'] }))).rejects.toThrow('insert boom');
    expect(h.state.insertCalls).toHaveLength(0);
  });

  it('passes a team report through unchanged', async () => {
    const res = await createReportsFromInput('u1', {
      ...base,
      reportType: 'team',
      config: { eventId: 'e1', timeframe, metrics: ['FLY10_TIME'] },
    } as any);
    expect(res.kind).toBe('single');
    expect(h.state.insertCalls[0][0].config.eventId).toBe('e1');
  });
});
