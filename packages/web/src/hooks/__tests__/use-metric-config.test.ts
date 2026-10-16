import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', isSiteAdmin: false }, organizationContext: 'org-1', userOrganizations: [] }),
}));
vi.mock('@/lib/metrics-api', () => ({
  useOrganizationMetrics: () => ({
    isLoading: false,
    data: [
      { metricCode: 'MILE', isEnabled: true, customLabel: null, siteMetric: { label: 'Mile', unit: 's', metricType: 'lower_is_better', isActive: true, isSystemDefault: false, displayFormat: 'duration', decimalPrecision: 1 } },
      { metricCode: 'FLY10_TIME', isEnabled: true, customLabel: null, siteMetric: { label: 'Fly', unit: 's', metricType: 'lower_is_better', isActive: true, isSystemDefault: true } },
    ],
  }),
}));
vi.mock('@/lib/custom-metrics-api', () => ({
  useCustomOrgMetrics: () => ({
    isLoading: false,
    data: [
      { code: 'ROW_2K', label: 'Row 2k', unit: 's', metricType: 'lower_is_better', isActive: true, displayFormat: 'duration', decimalPrecision: 2 },
      { code: 'OLD', label: 'Old', unit: 's', metricType: 'lower_is_better', isActive: false, displayFormat: 'duration', decimalPrecision: 2 },
    ],
  }),
}));

import { useMetricConfig } from '../use-metric-config';

describe('useMetricConfig: displayFormat', () => {
  it('returns the site metric display format, defaulting to decimal', () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useMetricConfig(), { wrapper });
    expect(result.current.getMetricConfig('MILE')?.displayFormat).toBe('duration');
    expect(result.current.getMetricConfig('FLY10_TIME')?.displayFormat).toBe('decimal');
    expect(result.current.metricsMap.MILE.displayFormat).toBe('duration');
  });

  it('returns decimalPrecision and looks up active custom org metrics', () => {
    const qc = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useMetricConfig(), { wrapper });
    expect(result.current.getMetricConfig('MILE')?.decimalPrecision).toBe(1);
    expect(result.current.getMetricConfig('ROW_2K')).toMatchObject({ label: 'Row 2k', unit: 's', displayFormat: 'duration', decimalPrecision: 2, lowerIsBetter: true });
    expect(result.current.getMetricConfig('OLD')).toBeNull();
  });
});
