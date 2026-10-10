/**
 * AM-FEAT-019 P2: `added` and `alreadyPresent` come from what the atomic bulk insert reports. A code a
 * concurrent request added first is alreadyPresent, not added; unusable metrics are reported as skipped keys.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db', () => ({ db: { select: () => ({ from: () => ({ where: () => Promise.resolve([{ orgType: 'club' }]) }) }) } }));
vi.mock('../../storage', () => ({ storage: {} }));
vi.mock('../event-metrics-service', () => ({ EventMetricsFrozenError: class extends Error {} }));

const bulkAddEventMetrics = vi.fn();
vi.mock('../event-metrics-bulk', () => ({ bulkAddEventMetrics: (...a: unknown[]) => bulkAddEventMetrics(...a) }));

const rows = new Map<string, any>();
vi.mock('../event-metric-eligibility', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchEligibilityRows: async () => rows,
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
const row = (code: string, extra: Record<string, unknown> = {}) => [code, { code, label: code, unit: 's', category: 'speed', isActive: true, isDerived: false, availableOrgTypes: null, ...extra }] as const;

describe('applyTemplateToEvent: concurrent add', () => {
  beforeEach(() => {
    rows.clear();
    bulkAddEventMetrics.mockReset();
  });

  it('reports a code the insert skipped as alreadyPresent, not added', async () => {
    const [a, b] = [codeOf('DASH_10'), codeOf('FLY_10')];
    rows.set(...row(a)); rows.set(...row(b));
    bulkAddEventMetrics.mockResolvedValue({ added: [a], alreadyPresent: [b], skipped: [] });
    const r = await applyTemplateToEvent('ev', 'u', template, 'org');
    expect(r).toEqual({ added: [a], alreadyPresent: [b], skipped: [] });
  });

  it('skips a template metric that is inactive, derived or not offered to the org type, reporting the key', async () => {
    const [a, b] = [codeOf('DASH_10'), codeOf('FLY_10')];
    rows.set(...row(a)); rows.set(...row(b, { isActive: false }));
    bulkAddEventMetrics.mockResolvedValue({ added: [a], alreadyPresent: [], skipped: [] });
    expect((await applyTemplateToEvent('ev', 'u', template, 'org')).skipped).toEqual(['FLY_10']);
    expect(bulkAddEventMetrics.mock.calls[0][2].map((m: any) => m.metricCode)).toEqual([a]);

    rows.set(...row(b, { isDerived: true }));
    expect((await applyTemplateToEvent('ev', 'u', template, 'org')).skipped).toEqual(['FLY_10']);
    rows.set(...row(b, { availableOrgTypes: ['college'] }));
    expect((await applyTemplateToEvent('ev', 'u', template, 'org')).skipped).toEqual(['FLY_10']);
  });
});
