// Issue #805: a metric athletes are not ranked on (the server's `unrankedMetrics`) shows values by
// name, with no rank, medals, percentile, quartile or deviation / z-score colours.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamReportView } from '../TeamReportView';
import { AthleteReportView } from '../AthleteReportView';
import { PercentileRadarSection } from '../PercentileRadarSection';
import { DistributionSection } from '../DistributionSection';
import type { Report, TeamReportData } from '@/types/report-types';

let payload: unknown;
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
vi.mock('@/hooks/use-metric-labels', () => ({ useMetricLabels: () => ({ getLabel: (c: string) => c, types: {} }) }));
vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: () => ({ athlete: 'Athlete', athletes: 'Athletes', team: 'Team', teams: 'Teams' }),
}));
vi.mock('@/hooks/use-teams', () => ({ useTeams: () => ({ data: [] }) }));
vi.mock('@/hooks/use-organization-details', () => ({ useOrganizationDetails: () => ({ data: undefined }) }));
vi.mock('@/components/reports/CoachingInsightsCard', () => ({ CoachingInsightsCard: () => null }));
const radarSpy = vi.fn();
vi.mock('@/components/charts/RadarChart', () => ({
  RadarChart: (props: unknown) => {
    radarSpy(props);
    return <div data-testid="radar" />;
  },
}));

const stat = (metric: string, average: number) => ({
  metric, units: '', average, median: average, min: average - 1, max: average + 1, standardDeviation: 5, topPerformer: null,
});

const teamData: TeamReportData = {
  reportType: 'team',
  reportConfig: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['VERTICAL_JUMP', 'BODY_WEIGHT'] },
  teamStatistics: [stat('VERTICAL_JUMP', 20), stat('BODY_WEIGHT', 170)],
  athleteRankings: [
    { userId: 'u1', userName: 'Zoe', compositeIndex: 80, measurements: { VERTICAL_JUMP: 25, BODY_WEIGHT: 150 }, percentiles: { VERTICAL_JUMP: 90 } },
    { userId: 'u2', userName: 'Adam', compositeIndex: 20, measurements: { VERTICAL_JUMP: 15, BODY_WEIGHT: 200 }, percentiles: { VERTICAL_JUMP: 10 } },
  ],
  athleteCount: 2,
  teamIds: [],
  generatedAt: '2026-11-01T10:00:00Z',
  metricLabels: { VERTICAL_JUMP: 'Vertical Jump', BODY_WEIGHT: 'Body Weight' },
  unrankedMetrics: ['BODY_WEIGHT'],
};

const teamReport = {
  id: 'r1', organizationId: 'o1', createdBy: 'u1', name: 'Team Report', reportType: 'team',
  config: { ...teamData.reportConfig, compositeIndex: { enabled: true, weights: { VERTICAL_JUMP: 0.5, BODY_WEIGHT: 0.5 } } },
  isTemplate: false, isPinned: false, createdAt: '2026-11-01T10:00:00Z',
} as unknown as Report;

// Sections that load their own data (benchmarks, metric config) get an empty answer, not a network call
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
});

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

/** The "Individual Performance by Metric" card titled `title`. */
const metricCard = (title: string) => {
  let el: HTMLElement | null = screen.getAllByText(title).find((e) => e.closest('table') === null) ?? null;
  while (el && !el.querySelector('table')) el = el.parentElement;
  return el!;
};

describe.each([
  ['TeamReportView', () => wrap(<TeamReportView report={teamReport} />)],
  ['AthleteReportView (team)', () => wrap(<AthleteReportView report={teamReport} />)],
])('%s with an unranked metric', (_name, show) => {
  it('lists the unranked metric by name with no rank, percentile, quartile or colours', async () => {
    payload = teamData;
    show();
    await waitFor(() => expect(screen.getByText('Individual Performance by Metric')).toBeInTheDocument());

    const card = metricCard('Body Weight');
    const table = within(card).getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).not.toContain('Rank');
    expect(headers).not.toContain('Percentile');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Adam', 'Zoe']);
    expect(table.querySelector('.text-green-600, .text-red-600')).toBeNull();
    expect(table.textContent).not.toMatch(/#\d|Top 25%|Bottom 25%/);
  });

  it('keeps rank and percentile for a ranked metric', async () => {
    payload = teamData;
    show();
    await waitFor(() => expect(screen.getByText('Individual Performance by Metric')).toBeInTheDocument());

    const headers = within(within(metricCard('Vertical Jump')).getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toContain('Rank');
    expect(headers).toContain('Percentile');
  });

  it('gives no composite rank to an athlete without a score', async () => {
    payload = {
      ...teamData,
      athleteRankings: [teamData.athleteRankings[0], { ...teamData.athleteRankings[1], compositeIndex: undefined }],
    };
    show();
    await waitFor(() => expect(screen.getByText('Composite Index Rankings')).toBeInTheDocument());
    const rows = within(within(metricCard('Composite Index Rankings')).getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['#1', '-']);
  });

  it('shows a dash as the top performer of an unranked metric', async () => {
    payload = teamData;
    show();
    await waitFor(() => expect(screen.getByText('Individual Performance by Metric')).toBeInTheDocument());
    const statRow = screen
      .getAllByRole('row')
      .find((r) => within(r).queryAllByRole('cell')[0]?.textContent === 'Body Weight')!;
    const cells = within(statRow).getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toContain('-');
    expect(cells).not.toContain('N/A');
  });

  it('leaves unranked weights out of the composite description', async () => {
    payload = teamData;
    show();
    await waitFor(() => expect(screen.getByText('Composite Index Rankings')).toBeInTheDocument());
    expect(screen.getByText('Weighted average of percentiles: Vertical Jump (100%)')).toBeInTheDocument();
  });
});

describe('PercentileRadarSection with unranked metrics', () => {
  it('plots only metrics with a percentile that are not unranked, and hides under three', () => {
    radarSpy.mockClear();
    const { container } = render(
      <PercentileRadarSection
        athleteId="u1"
        athleteName="Zoe"
        percentiles={{ A: 10, B: 20, BODY_WEIGHT: 50 }}
        measurements={{ A: 1, B: 2, BODY_WEIGHT: 150, MQI_TOTAL: 12 }}
        unrankedMetrics={['BODY_WEIGHT']}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(radarSpy).not.toHaveBeenCalled();
  });

  it('passes only rankable spokes to the chart', () => {
    radarSpy.mockClear();
    render(
      <PercentileRadarSection
        athleteId="u1"
        athleteName="Zoe"
        percentiles={{ A: 10, B: 20, C: 30, BODY_WEIGHT: 50 }}
        measurements={{ A: 1, B: 2, C: 3, BODY_WEIGHT: 150 }}
        unrankedMetrics={['BODY_WEIGHT']}
      />,
    );
    const [{ data }] = radarSpy.mock.calls[0] as [{ data: Array<{ metrics: Record<string, number> }> }];
    expect(Object.keys(data[0].metrics)).toEqual(['A', 'B', 'C']);
  });
});

describe('DistributionSection with unranked metrics', () => {
  const dist = { values: [1, 2, 3, 4], athleteValue: 3, direction: 'higher' as const };
  it('shows no "better than" histogram for an unranked metric', () => {
    render(
      <DistributionSection
        athleteName="Zoe"
        distributions={{ VERTICAL_JUMP: dist, BODY_WEIGHT: dist } as never}
        metricLabels={{ VERTICAL_JUMP: 'Vertical Jump', BODY_WEIGHT: 'Body Weight' }}
        unrankedMetrics={['BODY_WEIGHT']}
      />,
    );
    expect(document.querySelector('[data-report-chart="dist:VERTICAL_JUMP"]')).toBeTruthy();
    expect(document.querySelector('[data-report-chart="dist:BODY_WEIGHT"]')).toBeNull();
  });

  it('renders nothing when every distribution is unranked', () => {
    const { container } = render(
      <DistributionSection athleteName="Zoe" distributions={{ BODY_WEIGHT: dist } as never} unrankedMetrics={['BODY_WEIGHT']} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
