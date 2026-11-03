import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AthleteReportView } from '../AthleteReportView';
import type { Report, IndividualReportData, TeamReportData } from '@/types/report-types';

const individualData: Partial<IndividualReportData> | Record<string, unknown> = {
  athlete: { userName: 'Lucy Ortiz', measurements: { FLY10_TIME: 1.2 }, percentiles: {}, benchmarkComparisons: {} },
  generatedAt: '2026-10-19T00:00:00Z',
  metricLabels: {}, metricUnits: {}, metricFormats: {},
};
const teamData: Partial<TeamReportData> | Record<string, unknown> = {
  teamStatistics: [], athleteRankings: [], teamName: 'U16', timeframe: { type: 'all' },
  reportConfig: { timeframe: { type: 'all' } }, generatedAt: '2026-10-19T00:00:00Z',
  metricLabels: {}, metricUnits: {}, metricFormats: {},
};
let payload: unknown = individualData;

// Real flow: first render has no data, the generate response arrives afterwards
vi.mock('@/hooks/use-reports', () => ({
  useGenerateReport: () => ({
    mutate: (_vars: unknown, opts: { onSuccess: (d: unknown) => void }) => {
      setTimeout(() => opts.onSuccess(payload), 0);
    },
    isPending: false,
    isError: false,
  }),
}));
vi.mock('@/hooks/use-report-pdf', () => ({ useReportPdf: () => ({ downloadPdf: vi.fn(), isDownloading: false }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/use-metric-labels', () => ({ useMetricLabels: () => {
    // a real hook, as in production (react-query), so a changed hook count is detected
    useState(0);
    return { getLabel: (c: string) => c, types: {} };
  } }));
vi.mock('@/hooks/useContextualLabels', () => ({ useContextualLabels: () => ({ athlete: 'Athlete', athletes: 'Athletes' }) }));
vi.mock('@/hooks/use-teams', () => ({ useTeams: () => ({ data: [] }) }));

const report = (reportType: string): Report =>
  ({
    id: 'r1', organizationId: 'o1', createdBy: 'u1', name: 'Evaluation 10/13/26 - Lucy Ortiz', reportType,
    config: { athleteId: 'a1', timeframe: { type: 'all' } }, isTemplate: false, isPinned: false, createdAt: '2026-10-19T00:00:00Z',
  }) as unknown as Report;

describe('AthleteReportView hook order', () => {
  beforeEach(() => { payload = individualData; });

  it('renders an individual report once its data arrives (no hook-count change)', async () => {
    payload = individualData;
    render(<AthleteReportView report={report('individual')} />);
    await waitFor(() => expect(screen.getByText('Lucy Ortiz')).toBeInTheDocument());
    expect(screen.queryByText('Loading report...')).not.toBeInTheDocument();
  });

  it('shows the sprint runs card to the athlete when the report selected it', async () => {
    const row = (metric: string, value: string, extra: Record<string, unknown> = {}) => ({
      metric, value, date: '2026-09-01', isVerified: true, organizationId: 'o1', importBatchId: null, notes: null,
      calculationMetadata: { formula: 'direct_import', runId: 'r1', ...extra },
    });
    payload = {
      ...individualData,
      reportConfig: { metrics: ['FLY10_TIME'], charts: { sprintRuns: true } },
      sprintRunMeasurements: [row('DASH_20YD', '3.30'), row('DASH_10YD', '1.90', { formula: 'direct_import_split', parentMetric: 'DASH_20YD' })],
    };
    render(<AthleteReportView report={report('individual')} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /sprint runs/i })).toBeInTheDocument());
  });

  it('renders a team report once its data arrives', async () => {
    payload = teamData;
    render(<AthleteReportView report={report('team')} />);
    await waitFor(() => expect(screen.getByText('Evaluation 10/13/26 - Lucy Ortiz')).toBeInTheDocument());
    expect(screen.queryByText('Loading report...')).not.toBeInTheDocument();
  });
});
