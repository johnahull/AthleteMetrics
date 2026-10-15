import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IndividualReportView } from '../IndividualReportView';
import { useGenerateReport } from '@/hooks/use-reports';
import type { Report } from '@/types/report-types';

vi.mock('@/hooks/use-reports');
vi.mock('@/hooks/use-report-pdf', () => ({
  useReportPdf: () => ({ downloadPdf: vi.fn(), isDownloading: false }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { role: 'coach' } }) }));
vi.mock('@/components/athletes/LlmExportButton', () => ({ LlmExportButton: () => null }));
vi.mock('../ShareReportDialog', () => ({ ShareReportDialog: () => null }));
vi.mock('../SendReportToAthleteDialog', () => ({ SendReportToAthleteDialog: () => null }));
vi.mock('../CoachingInsightsCard', () => ({ CoachingInsightsCard: () => <div data-testid="insights" /> }));
vi.mock('../ReportMetricsGlossary', () => ({ ReportMetricsGlossary: () => <div data-testid="glossary" /> }));
vi.mock('../MetricExplanation', () => ({ MetricExplanation: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('@/components/reports/TrendSection', () => ({ TrendSection: () => null }));
vi.mock('@/components/reports/PercentileRadarSection', () => ({ PercentileRadarSection: () => null }));
vi.mock('@/components/reports/DistributionSection', () => ({ DistributionSection: () => null }));
vi.mock('@/components/reports/FvProfileSection', () => ({ FvProfileSection: () => null }));
vi.mock('@/components/charts/TierProgressChart', () => ({ TierProgressChart: () => null }));
vi.mock('@/components/charts/BenchmarkStandingBar', () => ({ BenchmarkStandingBar: () => null }));

const report = {
  id: 'report-1',
  organizationId: 'org-1',
  createdBy: 'user-1',
  name: 'Individual Report',
  reportType: 'individual',
  config: { athleteId: 'ath-1', timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP'] },
} as unknown as Report;

function renderWith(reportConfig: Record<string, unknown>, measurements: Record<string, number> = { VERTICAL_JUMP: 27.5 }) {
  const data = {
    reportType: 'individual',
    reportConfig: { metrics: ['VERTICAL_JUMP'], ...reportConfig },
    generatedAt: '2024-03-15T00:00:00Z',
    metricLabels: { VERTICAL_JUMP: 'Vertical Jump' },
    metricUnits: { VERTICAL_JUMP: 'in' },
    metricExplanations: { VERTICAL_JUMP: { whatItMeasures: 'x' } },
    athlete: {
      userId: 'ath-1',
      userName: 'Test Athlete',
      measurements,
      percentiles: { VERTICAL_JUMP: 80 },
      teamAverages: { VERTICAL_JUMP: 24 },
      benchmarkComparisons: {},
    },
  };
  vi.mocked(useGenerateReport).mockReturnValue({
    mutate: (_vars: unknown, opts: { onSuccess: (d: unknown) => void }) => opts.onSuccess(data),
    isPending: false,
    isError: false,
  } as any);
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <IndividualReportView report={report} />
    </QueryClientProvider>,
  );
}

describe('IndividualReportView — group comparison columns', () => {
  it('hides Group Average and Percentile when groupComparison is false, keeps Benchmark column', () => {
    renderWith({ groupComparison: false });
    expect(screen.getByText('Best Result')).toBeInTheDocument();
    expect(screen.queryByText('Group Average')).not.toBeInTheDocument();
    expect(screen.queryByText('Percentile')).not.toBeInTheDocument();
    expect(screen.queryByText(/th percentile/)).not.toBeInTheDocument();
    expect(screen.getByText('Benchmark Comparisons')).toBeInTheDocument();
  });

  it('shows the columns when the key is missing (legacy report)', () => {
    renderWith({});
    expect(screen.getByText('Group Average')).toBeInTheDocument();
    expect(screen.getByText('Percentile')).toBeInTheDocument();
    expect(screen.getByText('80.0th percentile')).toBeInTheDocument();
  });
});

describe('IndividualReportView — no measurements', () => {
  it('shows an empty state instead of insights and glossary', () => {
    renderWith({}, {});
    expect(screen.getByText(/no measurements recorded/i)).toBeInTheDocument();
    expect(screen.queryByTestId('insights')).not.toBeInTheDocument();
    expect(screen.queryByTestId('glossary')).not.toBeInTheDocument();
  });

  it('shows insights and glossary when there are measurements', () => {
    renderWith({});
    expect(screen.queryByText(/no measurements recorded/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('insights')).toBeInTheDocument();
    expect(screen.getByTestId('glossary')).toBeInTheDocument();
  });
});
