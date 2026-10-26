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
const authState = vi.hoisted(() => ({
  value: { user: { role: 'coach' } as any, userOrganizations: [{ organizationId: 'org-1', role: 'coach' }] as any },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => authState.value }));
const llmButtonProps = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('@/components/athletes/LlmExportButton', () => ({
  LlmExportButton: (props: any) => {
    llmButtonProps.calls.push(props);
    return <div data-testid="llm-export" />;
  },
}));
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

function renderWith(
  reportConfig: Record<string, unknown>,
  measurements: Record<string, number> = { VERTICAL_JUMP: 27.5 },
  extra: { metricFormats?: Record<string, unknown>; teamAverages?: Record<string, number> } = {},
) {
  const data = {
    metricFormats: extra.metricFormats,
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
      teamAverages: extra.teamAverages ?? { VERTICAL_JUMP: 24 },
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

describe('IndividualReportView — LLM export button', () => {
  const setAuth = (user: any, userOrganizations: any) => {
    authState.value = { user, userOrganizations };
    llmButtonProps.calls.length = 0;
  };

  it('passes a report-scoped buildContent', () => {
    setAuth({ role: 'coach' }, [{ organizationId: 'org-1', role: 'coach' }]);
    renderWith({});
    expect(screen.getByTestId('llm-export')).toBeInTheDocument();
    const { buildContent } = llmButtonProps.calls[llmButtonProps.calls.length - 1];
    const out = buildContent('markdown');
    expect(out.content).toContain('# Individual Report');
    expect(out.content).toContain('27.50 in');
  });

  it('shows the button to a user who is an athlete in the first org but a coach in the report org', () => {
    setAuth({ role: 'athlete' }, [
      { organizationId: 'org-0', role: 'athlete' },
      { organizationId: 'org-1', role: 'coach' },
    ]);
    renderWith({});
    expect(screen.getByTestId('llm-export')).toBeInTheDocument();
  });

  it('hides the button from a user who is a coach in the first org but an athlete in the report org', () => {
    setAuth({ role: 'coach' }, [
      { organizationId: 'org-0', role: 'coach' },
      { organizationId: 'org-1', role: 'athlete' },
    ]);
    renderWith({});
    expect(screen.queryByTestId('llm-export')).not.toBeInTheDocument();
  });

  it('shows the button to a site admin', () => {
    setAuth({ role: 'athlete', isSiteAdmin: true }, []);
    renderWith({});
    expect(screen.getByTestId('llm-export')).toBeInTheDocument();
  });
});

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

describe('IndividualReportView — duration (mm:ss) metrics', () => {
  it('shows the best result and group average as m:ss', () => {
    renderWith({}, { VERTICAL_JUMP: 402.5 }, {
      metricFormats: { VERTICAL_JUMP: { unit: 's', displayFormat: 'duration', decimalPrecision: 1 } },
      teamAverages: { VERTICAL_JUMP: 410 },
    });
    expect(screen.getByText('6:42.5')).toBeInTheDocument();
    expect(screen.getByText('6:50.0')).toBeInTheDocument();
  });

  it('keeps report data saved without metricFormats as before', () => {
    renderWith({}, { VERTICAL_JUMP: 27.5 });
    expect(screen.getByText('27.50 in')).toBeInTheDocument();
  });
});

describe('IndividualReportView — metric groups', () => {
  const metricGroups = [
    { group: 'speed', label: 'Speed', codes: ['DASH_10YD'] },
    { group: 'power', label: 'Power', codes: ['VERTICAL_JUMP'] },
  ];

  function renderGrouped() {
    const data = {
      reportType: 'individual',
      reportConfig: { metrics: ['VERTICAL_JUMP', 'DASH_10YD'] },
      generatedAt: '2024-03-15T00:00:00Z',
      metricLabels: { VERTICAL_JUMP: 'Vertical Jump', DASH_10YD: '10 Yard Dash' },
      metricUnits: { VERTICAL_JUMP: 'in', DASH_10YD: 's' },
      metricExplanations: {},
      metricGroups,
      athlete: {
        userName: 'Test Athlete',
        measurements: { DASH_10YD: 1.7, VERTICAL_JUMP: 27.5 },
        percentiles: {},
        benchmarkComparisons: {
          DASH_10YD: [{ benchmarkName: 'B', benchmarkValue: 1.8, athleteValue: 1.7, meetsOrExceeds: true }],
          VERTICAL_JUMP: [{ benchmarkName: 'B', benchmarkValue: 20, athleteValue: 27.5, meetsOrExceeds: true }],
        },
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

  it('renders a rowgroup heading per group in the performance table, in order', () => {
    renderGrouped();
    const table = screen.getByRole('table');
    const headings = table.querySelectorAll('th[scope="rowgroup"]');
    expect(Array.from(headings).map((h) => h.textContent)).toEqual(['Speed', 'Power']);
    expect(headings[0].getAttribute('colspan')).toBe('5');
    const text = table.textContent!;
    expect(text.indexOf('Speed')).toBeLessThan(text.indexOf('10 Yard Dash'));
    expect(text.indexOf('10 Yard Dash')).toBeLessThan(text.indexOf('Power'));
    expect(text.indexOf('Power')).toBeLessThan(text.indexOf('Vertical Jump'));
  });

  it('renders group headings in the benchmark standing card', () => {
    renderGrouped();
    expect(screen.getByText('Benchmark Standing')).toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('h4')).map((h) => h.textContent)).toEqual(['Speed', 'Power']);
  });
});
