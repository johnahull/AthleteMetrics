import { describe, it, expect } from 'vitest';
import type { Measurement } from '@shared/schema';
import { buildMqCells, mqSaveFailure, mqSaveRequests, type MqGrid } from '../mq-sheet-cells';

const row = (id: string, userId: string, metric: string, value: number): Measurement =>
  ({ id, userId, metric, value: String(value), notes: 'note', mediaUrl: null, isCalculated: false }) as any;

describe('buildMqCells', () => {
  it('builds a cell per athlete and sheet code from the saved scores, a saved 0 included', () => {
    const grid = buildMqCells({}, [row('a', 'ath-1', 'MQ_JUMP', 0), row('b', 'ath-2', 'MQ_DECEL', 3)], ['ath-1', 'ath-2'], ['MQ_JUMP', 'MQ_DECEL']);
    expect(grid['ath-1'].measurements.MQ_JUMP).toEqual({ userId: 'ath-1', metricCode: 'MQ_JUMP', value: '0', originalValue: 0, isDirty: false });
    expect(grid['ath-1'].measurements.MQ_DECEL).toEqual({ userId: 'ath-1', metricCode: 'MQ_DECEL', value: '', originalValue: undefined, isDirty: false });
    expect(grid['ath-2'].measurements.MQ_DECEL.originalValue).toBe(3);
  });

  it('takes the first (newest) row of legacy duplicates, the one the server upsert edits', () => {
    const grid = buildMqCells({}, [row('new', 'ath-1', 'MQ_JUMP', 2), row('old', 'ath-1', 'MQ_JUMP', 1)], ['ath-1'], ['MQ_JUMP']);
    expect(grid['ath-1'].measurements.MQ_JUMP.originalValue).toBe(2);
  });

  it('keeps unsaved file values and conflicts across a rebuild (refetch)', () => {
    const prev: MqGrid = {
      'ath-1': {
        measurements: {
          MQ_JUMP: { userId: 'ath-1', metricCode: 'MQ_JUMP', value: '3', isDirty: true, fromImport: true, error: 'Busy' },
          MQ_DECEL: { userId: 'ath-1', metricCode: 'MQ_DECEL', value: '2', originalValue: 2, isDirty: false, importedValue: '1' },
        },
      },
    };
    const grid = buildMqCells(prev, [row('d', 'ath-1', 'MQ_DECEL', 2)], ['ath-1'], ['MQ_JUMP', 'MQ_DECEL']);
    expect(grid['ath-1'].measurements.MQ_JUMP).toMatchObject({ value: '3', isDirty: true, fromImport: true, error: 'Busy' });
    expect(grid['ath-1'].measurements.MQ_DECEL).toMatchObject({ value: '2', originalValue: 2, importedValue: '1' });
  });

  it('compares numerically: a kept file value "2.0" against a saved 2 is clean', () => {
    const prev: MqGrid = {
      'ath-1': { measurements: { MQ_JUMP: { userId: 'ath-1', metricCode: 'MQ_JUMP', value: '2.0', isDirty: true, fromImport: true } } },
    };
    expect(buildMqCells(prev, [row('j', 'ath-1', 'MQ_JUMP', 2)], ['ath-1'], ['MQ_JUMP'])['ath-1'].measurements.MQ_JUMP.isDirty).toBe(false);
  });

  it('a kept file value equal to the new saved score is clean', () => {
    const prev: MqGrid = {
      'ath-1': { measurements: { MQ_JUMP: { userId: 'ath-1', metricCode: 'MQ_JUMP', value: '3', isDirty: true, fromImport: true } } },
    };
    const grid = buildMqCells(prev, [row('j', 'ath-1', 'MQ_JUMP', 3)], ['ath-1'], ['MQ_JUMP']);
    expect(grid['ath-1'].measurements.MQ_JUMP).toMatchObject({ value: '3', originalValue: 3, isDirty: false });
  });
});

describe('mqSaveRequests', () => {
  const cell = (userId: string, metricCode: string, extra: Record<string, unknown>) => ({ userId, metricCode, value: '', isDirty: false, ...extra });
  const grid: MqGrid = {
    'ath-1': {
      measurements: {
        MQ_JUMP: cell('ath-1', 'MQ_JUMP', { value: '3', isDirty: true, fromImport: true }),
        MQ_DECEL: cell('ath-1', 'MQ_DECEL', { value: '0', isDirty: true, fromImport: true }),
        MQ_SHUFFLE: cell('ath-1', 'MQ_SHUFFLE', { value: '2', originalValue: 2 }),
        MQ_LATRUN: cell('ath-1', 'MQ_LATRUN', { value: '2', originalValue: 2, importedValue: '1' }),
      },
    },
    'ath-2': { measurements: { MQ_JUMP: cell('ath-2', 'MQ_JUMP', { value: '1', originalValue: 1 }) } },
    'ath-3': { measurements: { MQ_JUMP: cell('ath-3', 'MQ_JUMP', { value: '1', isDirty: true, fromImport: true }) } },
  };

  it('groups the dirty scores by athlete as { metric, value } only, skipping clean and conflict cells', () => {
    const requests = mqSaveRequests(grid);
    expect(requests.map((r) => r.userId)).toEqual(['ath-1', 'ath-3']);
    expect(requests[0].upserts).toEqual([
      { metric: 'MQ_JUMP', value: 3 },
      { metric: 'MQ_DECEL', value: 0 },
    ]);
    requests[0].upserts.forEach((u) => expect(Object.keys(u).sort()).toEqual(['metric', 'value']));
    expect(requests[0].cells.map((c) => c.metricCode)).toEqual(['MQ_JUMP', 'MQ_DECEL']);
  });
});

describe('mqSaveFailure', () => {
  const withStatus = (message: string, status?: number, code?: string) => Object.assign(new Error(message), status ? { status, code } : {});

  it('per-score errors: no stop, the errors by metric', () => {
    const error = Object.assign(new Error('1 score could not be saved'), { errors: [{ metric: 'MQ_JUMP', error: 'Value must be at most 3' }] });
    expect(mqSaveFailure(error)).toEqual({ stop: false, message: '1 score could not be saved', errors: { MQ_JUMP: 'Value must be at most 3' } });
  });

  it('another 400 (e.g. not a member) is an error on that athlete only', () => {
    expect(mqSaveFailure(withStatus('Athlete is not a member', 400))).toEqual({ stop: false, message: 'Athlete is not a member' });
  });

  it.each([
    ['rate limit', withStatus('Too many requests', 429)],
    ['access', withStatus('Access denied', 403)],
    ['server', withStatus('Internal error', 503)],
    ['network', new Error('Failed to fetch')],
    ['frozen event', withStatus('Event is locked', 400, 'EVENT_FROZEN')],
  ])('stops on a %s error', (_name, error) => {
    expect(mqSaveFailure(error)).toMatchObject({ stop: true, message: error.message });
  });
});
