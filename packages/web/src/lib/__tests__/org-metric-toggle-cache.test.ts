/**
 * Toggling an org metric must not refetch the org metrics list: each refetch spends the
 * per-user API rate-limit budget (100 requests / 15 min), so ~30 toggles locked users out.
 */

import { describe, it, expect } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { applyOrgMetricUpdate } from '../metrics-api';

const ORG = 'org-1';
const row = (metricCode: string, isEnabled: boolean) =>
  ({ id: `om-${metricCode}`, organizationId: ORG, metricCode, isEnabled, siteMetric: { code: metricCode } }) as any;

function seeded() {
  const qc = new QueryClient();
  qc.setQueryData(['organizationMetrics', ORG, false], [row('A', false), row('B', true)]);
  qc.setQueryData(['organizationMetrics', ORG, true], [row('B', true)]);
  return qc;
}

describe('applyOrgMetricUpdate', () => {
  it('merges the response into the full list, keeping the joined siteMetric', () => {
    const qc = seeded();
    applyOrgMetricUpdate(qc, ORG, { id: 'om-A', organizationId: ORG, metricCode: 'A', isEnabled: true } as any);
    const list = qc.getQueryData<any[]>(['organizationMetrics', ORG, false])!;
    expect(list.find((m) => m.metricCode === 'A')).toMatchObject({ isEnabled: true, siteMetric: { code: 'A' } });
    expect(list.find((m) => m.metricCode === 'B')!.isEnabled).toBe(true);
  });

  it('keeps the patched full list fresh across mounts', () => {
    const qc = seeded();
    applyOrgMetricUpdate(qc, ORG, { id: 'om-A', organizationId: ORG, metricCode: 'A', isEnabled: true } as any);
    expect(qc.getQueryState(['organizationMetrics', ORG, false])!.isInvalidated).toBe(false);
  });

  it('does not throw when nothing is cached yet', () => {
    const qc = new QueryClient();
    expect(() =>
      applyOrgMetricUpdate(qc, ORG, { id: 'om-A', organizationId: ORG, metricCode: 'A', isEnabled: true } as any)
    ).not.toThrow();
  });

  it('does not refetch unmounted queries, only marks the enabledOnly variant stale', () => {
    const qc = seeded();
    applyOrgMetricUpdate(qc, ORG, { id: 'om-A', organizationId: ORG, metricCode: 'A', isEnabled: true } as any);
    expect(qc.isFetching()).toBe(0);
    expect(qc.getQueryState(['organizationMetrics', ORG, true])!.isInvalidated).toBe(true);
  });

  it('refetches the enabledOnly variant when a component is watching it', () => {
    const qc = seeded();
    let fetches = 0;
    const unsubscribe = new QueryObserver(qc, {
      queryKey: ['organizationMetrics', ORG, true],
      queryFn: async () => { fetches++; return []; },
      staleTime: Infinity,
    }).subscribe(() => {});
    fetches = 0;
    applyOrgMetricUpdate(qc, ORG, { id: 'om-A', organizationId: ORG, metricCode: 'A', isEnabled: true } as any);
    expect(fetches).toBe(1);
    unsubscribe();
  });

  it('falls back to a refetch when the metric is not in the cached list', () => {
    const qc = seeded();
    applyOrgMetricUpdate(qc, ORG, { id: 'om-Z', organizationId: ORG, metricCode: 'Z', isEnabled: true } as any);
    expect(qc.getQueryState(['organizationMetrics', ORG, false])!.isInvalidated).toBe(true);
  });
});
