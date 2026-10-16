/**
 * Shared cases: calendar dates outside the athlete pages (measurement dates from
 * raw-SQL endpoints as UTC-midnight ISO, wellness filter 'YYYY-MM-DD' values)
 * render on the stored day. Imported by per-timezone test files.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RecentAthletesWidget from '@/components/recent-athletes-widget';
import { WellnessFilters } from '@/components/wellness/WellnessFilters';

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (code: string) => code, isLoading: false }),
}));

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => [] } } });
}

export function describeWidgetCalendarDateCases(zone: string) {
  describe(`widget calendar dates render on the stored day (${zone})`, () => {
    it('RecentAthletesWidget shows the last measurement day', () => {
      const qc = client();
      qc.setQueryData(['/api/athletes/recent', 'o1'], {
        athletes: [{
          id: 'u1', firstName: 'Lucy', lastName: 'Ortiz', avatar: null, teamName: null,
          lastMeasurementDate: '2026-03-10T00:00:00.000Z', lastMeasurementType: 'FLY10_TIME',
        }],
      });
      render(<QueryClientProvider client={qc}><RecentAthletesWidget organizationId="o1" /></QueryClientProvider>);
      expect(screen.getByText('Mar 10')).toBeInTheDocument();
    });

    it('WellnessFilters shows the selected date range days', () => {
      render(
        <QueryClientProvider client={client()}>
          <WellnessFilters
            filters={{ dateFrom: '2026-03-10', dateTo: '2026-03-12', teamIds: ['t1'], athleteIds: [], questionIds: [] }}
            onFilterChange={() => {}}
            onClearFilters={() => {}}
            organizationId="o1"
          />
        </QueryClientProvider>
      );
      const from = new Date(2026, 2, 10).toLocaleDateString();
      const to = new Date(2026, 2, 12).toLocaleDateString();
      expect(screen.getByTestId('active-filters')).toHaveTextContent(`${from} - ${to}`);
    });
  });
}
