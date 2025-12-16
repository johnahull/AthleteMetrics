/**
 * Tests for OrganizationBenchmarksList component
 * Verifies range benchmark display in organization benchmarks list
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrganizationBenchmarksList } from '../OrganizationBenchmarksList';

// Mock the benchmarks API
vi.mock('@/lib/benchmarks-api', () => ({
  useOrganizationBenchmarks: vi.fn(() => ({
    data: [],
    isLoading: false,
    error: null,
  })),
}));

// Mock the metric config hook
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({
      code,
      label: code,
      unit: code === 'FLY10_TIME' ? 's' : 'in',
      category: 'Speed',
    }),
  }),
}));

// Mock wouter
vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock child components
vi.mock('../BenchmarkCatalog', () => ({
  BenchmarkCatalog: () => <div data-testid="benchmark-catalog">Catalog</div>,
}));

vi.mock('../BenchmarkEnablementToggle', () => ({
  BenchmarkEnablementToggle: () => <div data-testid="enablement-toggle">Toggle</div>,
}));

vi.mock('../BenchmarkFilters', () => ({
  BenchmarkFilters: () => <div data-testid="benchmark-filters">Filters</div>,
}));

describe('OrganizationBenchmarksList', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderWithClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
      </QueryClientProvider>
    );
  };

  describe('Range Benchmark Display', () => {
    it('displays range benchmarks with "↔ X – Y" format', async () => {
      const { useOrganizationBenchmarks } = await import('@/lib/benchmarks-api');

      vi.mocked(useOrganizationBenchmarks).mockReturnValue({
        data: [
          {
            id: 'org-bench-1',
            organizationId: 'org-1',
            benchmarkId: 'bench-1',
            benchmarkType: 'site',
            isEnabled: true,
            customName: null,
            name: 'Vertical Jump Range',
            metricCode: 'VERTICAL_JUMP',
            description: 'Target range for vertical jump',
            benchmarkValue: null,
            comparisonOperator: 'range',
            minValue: 25,
            maxValue: 30,
            ageMin: null,
            ageMax: null,
            gender: null,
            position: null,
            level: null,
            isActive: true,
          },
        ],
        isLoading: false,
        error: null,
      } as any);

      renderWithClient(<OrganizationBenchmarksList organizationId="org-1" />);

      await waitFor(() => {
        expect(screen.getByText('Vertical Jump Range')).toBeInTheDocument();
      });

      // Should display "↔ 25 – 30 in" (with unit)
      expect(screen.getByText(/Target:/i)).toBeInTheDocument();
      expect(screen.getByText(/↔ 25 – 30 in/i)).toBeInTheDocument();
    });

    it('displays traditional benchmarks with operator symbols', async () => {
      const { useOrganizationBenchmarks } = await import('@/lib/benchmarks-api');

      vi.mocked(useOrganizationBenchmarks).mockReturnValue({
        data: [
          {
            id: 'org-bench-1',
            organizationId: 'org-1',
            benchmarkId: 'bench-1',
            benchmarkType: 'site',
            isEnabled: true,
            customName: null,
            name: 'Fly 10 Time',
            metricCode: 'FLY10_TIME',
            description: 'Target fly time',
            benchmarkValue: 1.0,
            comparisonOperator: 'lte',
            minValue: null,
            maxValue: null,
            ageMin: null,
            ageMax: null,
            gender: null,
            position: null,
            level: null,
            isActive: true,
          },
        ],
        isLoading: false,
        error: null,
      } as any);

      renderWithClient(<OrganizationBenchmarksList organizationId="org-1" />);

      await waitFor(() => {
        expect(screen.getByText('Fly 10 Time')).toBeInTheDocument();
      });

      // Should display "≤ 1 s" (with operator and unit)
      expect(screen.getByText(/≤ 1 s/i)).toBeInTheDocument();
    });

    it('handles range benchmarks without units', async () => {
      const { useOrganizationBenchmarks } = await import('@/lib/benchmarks-api');

      vi.mocked(useOrganizationBenchmarks).mockReturnValue({
        data: [
          {
            id: 'org-bench-1',
            organizationId: 'org-1',
            benchmarkId: 'bench-1',
            benchmarkType: 'site',
            isEnabled: true,
            customName: null,
            name: 'RSI Range',
            metricCode: 'RSI',
            description: 'Target RSI range',
            benchmarkValue: null,
            comparisonOperator: 'range',
            minValue: 2.0,
            maxValue: 2.5,
            ageMin: null,
            ageMax: null,
            gender: null,
            position: null,
            level: null,
            isActive: true,
          },
        ],
        isLoading: false,
        error: null,
      } as any);

      renderWithClient(<OrganizationBenchmarksList organizationId="org-1" />);

      await waitFor(() => {
        expect(screen.getByText('RSI Range')).toBeInTheDocument();
      });

      // Should display "↔ 2 – 2.5" (the mock returns unit 's' for all, but testing the range format)
      expect(screen.getByText(/↔ 2 – 2\.5/i)).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('displays empty state when no benchmarks', async () => {
      const { useOrganizationBenchmarks } = await import('@/lib/benchmarks-api');

      vi.mocked(useOrganizationBenchmarks).mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      } as any);

      renderWithClient(<OrganizationBenchmarksList organizationId="org-1" />);

      await waitFor(() => {
        expect(screen.getByText(/No Enabled Benchmarks/i)).toBeInTheDocument();
      });
    });

    it('displays loading state', async () => {
      const { useOrganizationBenchmarks } = await import('@/lib/benchmarks-api');

      vi.mocked(useOrganizationBenchmarks).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any);

      renderWithClient(<OrganizationBenchmarksList organizationId="org-1" />);

      await waitFor(() => {
        expect(screen.getByText(/Loading benchmarks/i)).toBeInTheDocument();
      });
    });
  });

  describe('Mixed Benchmarks', () => {
    it('displays both range and traditional benchmarks correctly', async () => {
      const { useOrganizationBenchmarks } = await import('@/lib/benchmarks-api');

      vi.mocked(useOrganizationBenchmarks).mockReturnValue({
        data: [
          {
            id: 'org-bench-1',
            organizationId: 'org-1',
            benchmarkId: 'bench-1',
            benchmarkType: 'site',
            isEnabled: true,
            customName: null,
            name: 'Vertical Jump Range',
            metricCode: 'VERTICAL_JUMP',
            description: null,
            benchmarkValue: null,
            comparisonOperator: 'range',
            minValue: 25,
            maxValue: 30,
            ageMin: null,
            ageMax: null,
            gender: null,
            position: null,
            level: null,
            isActive: true,
          },
          {
            id: 'org-bench-2',
            organizationId: 'org-1',
            benchmarkId: 'bench-2',
            benchmarkType: 'site',
            isEnabled: true,
            customName: null,
            name: 'Fly 10 Target',
            metricCode: 'FLY10_TIME',
            description: null,
            benchmarkValue: 1.0,
            comparisonOperator: 'lte',
            minValue: null,
            maxValue: null,
            ageMin: null,
            ageMax: null,
            gender: null,
            position: null,
            level: null,
            isActive: true,
          },
        ],
        isLoading: false,
        error: null,
      } as any);

      renderWithClient(<OrganizationBenchmarksList organizationId="org-1" />);

      await waitFor(() => {
        expect(screen.getByText('Vertical Jump Range')).toBeInTheDocument();
        expect(screen.getByText('Fly 10 Target')).toBeInTheDocument();
      });

      // Range benchmark
      expect(screen.getByText(/↔ 25 – 30/i)).toBeInTheDocument();
      // Traditional benchmark
      expect(screen.getByText(/≤ 1/i)).toBeInTheDocument();
    });
  });
});
