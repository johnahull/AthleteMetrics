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
  useMetricLabels: () => ({ labels: {}, getLabel: (c: string) => c, formats: {}, types: {}, isLoading: false }),
}));
vi.mock('../ShareReportDialog', () => ({ ShareReportDialog: () => null }));
vi.mock('../SendReportToMultipleAthletesDialog', () => ({ SendReportToMultipleAthletesDialog: () => null }));
vi.mock('../CoachingInsightsCard', () => ({ CoachingInsightsCard: () => null }));
vi.mock('../ReportMetricsGlossary', () => ({ ReportMetricsGlossary: () => null }));
vi.mock('../MetricExplanation', () => ({ MetricExplanation: ({ label }: { label: string }) => <span>{label}</span> }));

const report = {
  id: 'r1', organizationId: 'o1', createdBy: 'u1', name: 'Team', reportType: 'team',
  config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['DASH', 'JUMP'] },
} as unknown as Report;

const stat = (metric: string, v: number) => ({
  metric, units: 's', average: v, median: v, min: v, max: v, standardDeviation: 0, topPerformer: { userName: 'Sam', value: v },
});

function renderWith(opts: { metricGroups?: unknown; athleteRankings?: unknown[]; jumpUnrecorded?: boolean }) {
  const athleteRankings = opts.athleteRankings ?? [{ userId: 'a1', userName: 'Sam', measurements: opts.jumpUnrecorded ? { DASH: 1.7 } : { DASH: 1.7, JUMP: 20 } }];
  const data = {
    reportType: 'team',
    reportConfig: report.config,
    generatedAt: '2025-01-15T10:00:00Z',
    metricLabels: { DASH: 'Dash', JUMP: 'Jump' },
    metricUnits: { DASH: 's', JUMP: 'in' },
    teamStatistics: [stat('DASH', 1.7), stat('JUMP', 20)],
    athleteRankings,
    athleteCount: athleteRankings.length,
    teamIds: [],
    metricGroups: opts.metricGroups,
  };
  vi.mocked(useGenerateReport).mockReturnValue({
    mutate: (_v: unknown, o: { onSuccess: (d: unknown) => void }) => o.onSuccess(data),
    isPending: false,
    isError: false,
  } as any);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TeamReportView report={report} />
    </QueryClientProvider>,
  );
}

const groups = [
  { group: 'speed', label: 'Speed', codes: ['DASH'] },
  { group: 'power', label: 'Power', codes: ['JUMP'] },
];

describe('TeamReportView: metric group headings', () => {
  it('shows a heading per group in the snapshot table and the per-metric cards', () => {
    renderWith({ metricGroups: groups });
    // once in the Performance Snapshot table, once above the per-metric cards
    expect(screen.getAllByText('Speed')).toHaveLength(2);
    expect(screen.getAllByText('Power')).toHaveLength(2);
  });

  it('drops the heading of a group whose metrics nobody recorded', () => {
    renderWith({ metricGroups: groups, jumpUnrecorded: true });
    expect(screen.getAllByText('Speed')).toHaveLength(2);
    // snapshot table still lists the metric's group; the cards section does not
    expect(screen.getAllByText('Power')).toHaveLength(1);
  });

  it('shows no group headings and still lists every metric for data without metricGroups', () => {
    renderWith({});
    expect(screen.queryByText('Speed')).toBeNull();
    expect(screen.getAllByText('Dash').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jump').length).toBeGreaterThan(0);
  });
});

describe('TeamReportView: empty report', () => {
  it('shows an empty state when no athlete has measurements', () => {
    renderWith({ metricGroups: groups, athleteRankings: [] });
    expect(screen.getByText(/No measurements recorded for this .* in this report yet\./)).toBeInTheDocument();
  });

  it('shows no empty state when there are measurements', () => {
    renderWith({ metricGroups: groups });
    expect(screen.queryByText(/No measurements recorded/)).toBeNull();
  });
});
