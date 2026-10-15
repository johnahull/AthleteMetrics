import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamReportView } from '../TeamReportView';
import { useGenerateReport } from '@/hooks/use-reports';
import type { Report } from '@/types/report-types';

vi.mock('@/hooks/use-reports');
vi.mock('@/hooks/use-teams', () => ({ useTeams: () => ({ data: [], isLoading: false, error: null }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'coach' } }) }));
vi.mock('@/hooks/use-report-pdf', () => ({ useReportPdf: () => ({ downloadPdf: vi.fn(), isDownloading: false }) }));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (c: string) => c, formats: {}, isLoading: false }),
}));
vi.mock('../ShareReportDialog', () => ({ ShareReportDialog: () => null }));
vi.mock('../SendReportToMultipleAthletesDialog', () => ({ SendReportToMultipleAthletesDialog: () => null }));
vi.mock('../CoachingInsightsCard', () => ({ CoachingInsightsCard: () => null }));
vi.mock('../ReportMetricsGlossary', () => ({ ReportMetricsGlossary: () => null }));
vi.mock('../MetricExplanation', () => ({ MetricExplanation: ({ label }: { label: string }) => <span>{label}</span> }));

const report = {
  id: 'r1', organizationId: 'o1', createdBy: 'u1', name: 'Team', reportType: 'team',
  config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['MILE_RUN'] },
} as unknown as Report;

function renderWith(metricFormats?: Record<string, unknown>) {
  const data = {
    reportType: 'team',
    reportConfig: report.config,
    generatedAt: '2025-01-15T10:00:00Z',
    metricLabels: { MILE_RUN: 'Mile Run' },
    metricUnits: { MILE_RUN: 's' },
    metricFormats,
    teamStatistics: [
      { metric: 'MILE_RUN', units: 's', average: 406.5, median: 406.5, min: 402.5, max: 410.5, standardDeviation: 4, topPerformer: { userName: 'Sam', value: 402.5 } },
    ],
    athleteRankings: [{ userId: 'a1', userName: 'Sam', measurements: { MILE_RUN: 402.5 } }],
    athleteCount: 1,
    teamIds: [],
  };
  vi.mocked(useGenerateReport).mockReturnValue({
    mutate: (_v: unknown, opts: { onSuccess: (d: unknown) => void }) => opts.onSuccess(data),
    isPending: false,
    isError: false,
  } as any);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TeamReportView report={report} />
    </QueryClientProvider>,
  );
}

describe('TeamReportView: duration (mm:ss) metrics', () => {
  it('shows the average, top performer and range as m:ss', () => {
    renderWith({ MILE_RUN: { unit: 's', displayFormat: 'duration', decimalPrecision: 1 } });
    expect(screen.getAllByText('6:46.5').length).toBeGreaterThan(0);
    expect(screen.getAllByText('6:42.5').length).toBeGreaterThan(0);
    expect(screen.getByText('6:42.5 - 6:50.5')).toBeInTheDocument();
  });

  it('keeps report data without metricFormats as before', () => {
    renderWith(undefined);
    expect(screen.getAllByText('406.50 s').length).toBeGreaterThan(0);
  });
});
