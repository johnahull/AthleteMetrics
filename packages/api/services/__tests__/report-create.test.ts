import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    athletes: [] as Array<{ id: string; fullName: string }>,
    inserted: [] as any[],
    deleted: [] as any[],
    failOnInsert: -1,
  };
  const db = {
    select: () => ({ from: () => ({ where: async () => state.athletes }) }),
    insert: () => ({
      values: (v: any) => ({
        returning: async () => {
          if (state.inserted.length === state.failOnInsert) throw new Error('insert boom');
          const row = { id: `r${state.inserted.length}`, ...v };
          state.inserted.push(row);
          return [row];
        },
      }),
    }),
    delete: () => ({ where: async (w: any) => { state.deleted.push(w); } }),
  };
  return { state, db };
});

vi.mock('../../db', () => ({ db: h.db }));

import { createReportsFromInput, ReportCreateError } from '../report-create';

const timeframe = { type: 'custom', customStart: '2026-01-01', customEnd: '2026-02-01' };
const base = { name: 'Combine', organizationId: 'org1', description: undefined, isTemplate: false };

describe('createReportsFromInput', () => {
  beforeEach(() => {
    h.state.athletes = [];
    h.state.inserted = [];
    h.state.deleted = [];
    h.state.failOnInsert = -1;
  });

  it('creates one report per athlete with single athleteId and athlete name suffix', async () => {
    h.state.athletes = [{ id: 'a1', fullName: 'Ann' }, { id: 'a2', fullName: 'Bob' }];
    const res = await createReportsFromInput('u1', {
      ...base,
      reportType: 'individual',
      config: { eventId: 'e1', timeframe, metrics: ['FLY10_TIME'], athleteIds: ['a1', 'a2'] },
    } as any);

    expect(res.kind).toBe('batch');
    expect(h.state.inserted.map((r) => r.name)).toEqual(['Combine - Ann', 'Combine - Bob']);
    expect(h.state.inserted.map((r) => r.config.athleteId)).toEqual(['a1', 'a2']);
    expect(h.state.inserted[0].config.athleteIds).toBeUndefined();
    expect(h.state.inserted[0].config.eventId).toBe('e1');
    expect(h.state.inserted[0].createdBy).toBe('u1');
  });

  it('rejects unknown athlete ids with 400 and inserts nothing', async () => {
    h.state.athletes = [{ id: 'a1', fullName: 'Ann' }];
    const err = await createReportsFromInput('u1', {
      ...base,
      reportType: 'individual',
      config: { timeframe, metrics: [], athleteIds: ['a1', 'ghost'] },
    } as any).catch((e) => e);

    expect(err).toBeInstanceOf(ReportCreateError);
    expect(err.status).toBe(400);
    expect(err.body.missingIds).toEqual(['ghost']);
    expect(h.state.inserted).toHaveLength(0);
  });

  it('rolls back created reports when a later insert fails', async () => {
    h.state.athletes = [{ id: 'a1', fullName: 'Ann' }, { id: 'a2', fullName: 'Bob' }];
    h.state.failOnInsert = 1;
    await expect(
      createReportsFromInput('u1', {
        ...base,
        reportType: 'individual',
        config: { timeframe, metrics: [], athleteIds: ['a1', 'a2'] },
      } as any)
    ).rejects.toThrow('insert boom');
    expect(h.state.deleted).toHaveLength(1);
  });

  it('treats a one-athlete list as a batch of one, like POST /api/reports always did', async () => {
    h.state.athletes = [{ id: 'a1', fullName: 'Ann' }];
    const res = await createReportsFromInput('u1', {
      ...base,
      reportType: 'individual',
      config: { timeframe, metrics: [], athleteIds: ['a1'] },
    } as any);

    expect(res.kind).toBe('batch');
    expect(h.state.inserted[0].name).toBe('Combine - Ann');
    expect(h.state.inserted[0].config.athleteId).toBe('a1');
  });

  it('rejects an individual report with an empty athleteIds list', async () => {
    const err = await createReportsFromInput('u1', {
      ...base,
      reportType: 'individual',
      config: { timeframe, metrics: [], athleteIds: [] },
    } as any).catch((e) => e);
    expect(err).toBeInstanceOf(ReportCreateError);
    expect(err.status).toBe(400);
  });

  it('passes a team report through unchanged', async () => {
    const res = await createReportsFromInput('u1', {
      ...base,
      reportType: 'team',
      config: { eventId: 'e1', timeframe, metrics: ['FLY10_TIME'] },
    } as any);
    expect(res.kind).toBe('single');
    expect(h.state.inserted[0].config.eventId).toBe('e1');
  });
});
