/**
 * AM-FEAT-019 P2: `added` must come from what bulkAddMetrics actually inserted. A code that a concurrent
 * request added between the "present" check and the insert is skipped by the insert (skipExisting), so it
 * belongs in alreadyPresent, not added.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectResults: any[][] = [];
vi.mock('../../db', () => {
  const next = () => {
    const chain: any = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.then = (res: any, rej: any) => Promise.resolve(selectResults.shift() ?? []).then(res, rej);
    return chain;
  };
  return { db: { select: () => next() } };
});
vi.mock('../../storage', () => ({ storage: {} }));

const bulkAddMetrics = vi.fn();
vi.mock('../event-metrics-service', () => ({
  EventMetricsService: class {
    bulkAddMetrics = bulkAddMetrics;
  },
  EventMetricsFrozenError: class extends Error {},
}));

import { applyTemplateToEvent } from '../eval-template-service';
import { resolveTemplateKey } from '../eval-report/template-keys';

const template: any = {
  metrics: [
    { metricKey: 'DASH_10', isRequired: true, displayOrder: 1 },
    { metricKey: 'FLY_10', isRequired: true, displayOrder: 2 },
  ],
};
const codeOf = (k: string) => resolveTemplateKey(k);

describe('applyTemplateToEvent: concurrent add', () => {
  beforeEach(() => {
    selectResults.length = 0;
    bulkAddMetrics.mockReset();
  });

  it('reports a code the insert skipped as alreadyPresent, not added', async () => {
    const [a, b] = [codeOf('DASH_10'), codeOf('FLY_10')];
    selectResults.push([{ code: a }, { code: b }], []); // both known, none present at check time
    // another request added `b` in between: only `a` is actually inserted
    bulkAddMetrics.mockResolvedValue([{ metricCode: a }]);
    const r = await applyTemplateToEvent('ev', 'u', template);
    expect(r.added).toEqual([a]);
    expect(r.alreadyPresent).toEqual([b]);
    expect(r.skipped).toEqual([]);
  });

  it('keeps previously present codes in alreadyPresent and inserted ones in added', async () => {
    const [a, b] = [codeOf('DASH_10'), codeOf('FLY_10')];
    selectResults.push([{ code: a }, { code: b }], [{ code: a }]);
    bulkAddMetrics.mockResolvedValue([{ metricCode: b }]);
    const r = await applyTemplateToEvent('ev', 'u', template);
    expect(r.added).toEqual([b]);
    expect(r.alreadyPresent).toEqual([a]);
  });
});
