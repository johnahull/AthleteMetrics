import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IndividualReportView } from '../IndividualReportView';
import { TeamReportView } from '../TeamReportView';
import { useGenerateReport } from '@/hooks/use-reports';
import type { Report } from '@/types/report-types';

vi.mock('@/hooks/use-reports');
vi.mock('@/hooks/use-teams', () => ({ useTeams: () => ({ data: [], isLoading: false, error: null }) }));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'coach' }, userOrganizations: [{ organizationId: 'org-1', role: 'coach' }] }),
}));
vi.mock('@/hooks/use-report-pdf', () => ({ useReportPdf: () => ({ downloadPdf: vi.fn(), isDownloading: false }) }));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (c: string) => c, formats: {}, types: {}, isLoading: false }),
}));
vi.mock('@/components/athletes/LlmExportButton', () => ({ LlmExportButton: () => null }));
vi.mock('../ShareReportDialog', () => ({ ShareReportDialog: () => null }));
vi.mock('../SendReportToAthleteDialog', () => ({ SendReportToAthleteDialog: () => null }));
vi.mock('../SendReportToMultipleAthletesDialog', () => ({ SendReportToMultipleAthletesDialog: () => null }));
vi.mock('../ReportMetricsGlossary', () => ({ ReportMetricsGlossary: () => null }));
vi.mock('../MetricExplanation', () => ({ MetricExplanation: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('../CoachingInsightsCard', () => ({
  CoachingInsightsCard: ({ aiEnabled }: { aiEnabled: boolean }) => <div data-testid="insights" data-ai={String(aiEnabled)} />,
}));
vi.mock('@/components/reports/TrendSection', () => ({ TrendSection: () => null }));
vi.mock('@/components/reports/PercentileRadarSection', () => ({ PercentileRadarSection: () => null }));
vi.mock('@/components/reports/DistributionSection', () => ({ DistributionSection: () => null }));
vi.mock('@/components/reports/FvProfileSection', () => ({ FvProfileSection: () => null }));
vi.mock('@/components/charts/TierProgressChart', () => ({ TierProgressChart: () => null }));
vi.mock('@/components/charts/BenchmarkStandingBar', () => ({ BenchmarkStandingBar: () => null }));

const individual = {
  id: 'r1', organizationId: 'org-1', createdBy: 'u1', name: 'Ind', reportType: 'individual',
  config: { athleteId: 'a1', timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP'] },
} as unknown as Report;
const team = {
  id: 'r2', organizationId: 'org-1', createdBy: 'u1', name: 'Team', reportType: 'team',
  config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP'] },
} as unknown as Report;

const individualData = {
  reportType: 'individual', reportConfig: individual.config, generatedAt: '2024-03-15T00:00:00Z',
  metricLabels: { VERTICAL_JUMP: 'Vertical Jump' }, metricUnits: { VERTICAL_JUMP: 'in' }, metricExplanations: {},
  athlete: { userId: 'a1', userName: 'Ath', measurements: { VERTICAL_JUMP: 27.5 }, percentiles: {}, teamAverages: {}, benchmarkComparisons: {} },
};
const teamData = {
  reportType: 'team', reportConfig: team.config, generatedAt: '2025-01-15T10:00:00Z',
  metricLabels: { VERTICAL_JUMP: 'Vertical Jump' }, metricUnits: { VERTICAL_JUMP: 'in' },
  teamStatistics: [{ metric: 'VERTICAL_JUMP', units: 'in', average: 20, median: 20, min: 20, max: 20, standardDeviation: 0, topPerformer: { userName: 'Sam', value: 20 } }],
  athleteRankings: [{ userId: 'a1', userName: 'Sam', measurements: { VERTICAL_JUMP: 20 } }], athleteCount: 1, teamIds: [],
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: 'org-1', aiEnabled: true, aiEnabledBySiteAdmin: true }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function mountWith(data: unknown, ui: JSX.Element) {
  vi.mocked(useGenerateReport).mockReturnValue({
    mutate: (_v: unknown, o: { onSuccess: (d: unknown) => void }) => o.onSuccess(data), isPending: false, isError: false,
  } as any);
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe.each([
  ['IndividualReportView', individualData, <IndividualReportView report={individual} />],
  ['TeamReportView', teamData, <TeamReportView report={team} />],
])('%s reads the organization AI flags on a fresh load', (_name, data, ui) => {
  it('requests /api/organizations/:id and turns the AI controls on', async () => {
    mountWith(data, ui);
    await waitFor(() => expect(screen.getByTestId('insights')).toHaveAttribute('data-ai', 'true'));
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain('/api/organizations/org-1');
  });

  it('keeps the AI controls off when the site admin has not enabled AI', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'org-1', aiEnabled: true, aiEnabledBySiteAdmin: false }) });
    mountWith(data, ui);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByTestId('insights')).toHaveAttribute('data-ai', 'false');
  });
});
