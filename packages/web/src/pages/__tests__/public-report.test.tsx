import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PublicReport from '../public-report';
import { usePublicReport } from '@/hooks/use-reports';

vi.mock('wouter', () => ({ useRoute: () => [true, { token: 'tok' }] }));
vi.mock('@/hooks/use-reports', () => ({ usePublicReport: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: () => ({ athlete: 'Athlete', athletes: 'Athletes', team: 'Team', teams: 'Teams' }),
}));
vi.mock('@/lib/chartExport', () => ({ captureTrendCharts: vi.fn() }));
// Chart sections are heavy and irrelevant to ordering
vi.mock('@/components/reports/TrendSection', () => ({ TrendSection: () => null }));
vi.mock('@/components/reports/PercentileRadarSection', () => ({ PercentileRadarSection: () => null }));
vi.mock('@/components/reports/DistributionSection', () => ({ DistributionSection: () => null }));
vi.mock('@/components/reports/FvProfileSection', () => ({ FvProfileSection: () => null }));
vi.mock('@/components/athlete/SprintRunsCard', () => ({ SprintRunsCard: () => null }));
vi.mock('@/components/charts/TierProgressChart', () => ({ TierProgressChart: () => null }));
vi.mock('@/components/charts/BenchmarkStandingBar', () => ({ BenchmarkStandingBar: () => null }));
vi.mock('@/components/reports/TeamTrendSection', () => ({ TeamTrendSection: () => null }));
vi.mock('@/components/reports/TeamBenchmarkStandingSection', () => ({ TeamBenchmarkStandingSection: () => null }));
vi.mock('@/components/reports/TeamBoxSwarmSection', () => ({ TeamBoxSwarmSection: () => null }));
vi.mock('@/components/reports/LeaderboardBarSection', () => ({ LeaderboardBarSection: () => null }));
vi.mock('@/components/reports/TierDistributionChartSection', () => ({ TierDistributionChartSection: () => null }));
vi.mock('@/components/reports/ReportMetricsGlossary', () => ({ ReportMetricsGlossary: () => null }));
vi.mock('@/components/reports/EvalReportView', () => ({ EvalReportBody: () => <div>eval body</div> }));

const INSIGHTS = 'Great block of work.\n\n- Keep landing soft';

const individual = {
  reportType: 'individual',
  generatedAt: '2026-11-01T10:00:00Z',
  reportConfig: { timeframe: { type: 'preset', preset: 'all_time' } },
  athlete: { userName: 'Ben Parada', age: 16, teams: ['Varsity'], measurements: { VERTICAL_JUMP: 19.13 }, percentiles: {}, benchmarkComparisons: {} },
  metricLabels: { VERTICAL_JUMP: 'Vertical Jump' },
  metricUnits: { VERTICAL_JUMP: 'in' },
};

const team = {
  reportType: 'team',
  generatedAt: '2026-11-01T10:00:00Z',
  reportConfig: { timeframe: { type: 'preset', preset: 'season' } },
  athleteCount: 3,
  teamStatistics: [
    { metric: 'VERTICAL_JUMP', units: 'in', average: 20, median: 20, min: 18, max: 22, standardDeviation: 1, topPerformer: { userName: 'Ben', value: 22 } },
  ],
  athleteRankings: [],
  metricLabels: { VERTICAL_JUMP: 'Vertical Jump' },
  metricUnits: { VERTICAL_JUMP: 'in' },
};

function show(snapshotData: Record<string, unknown>) {
  vi.mocked(usePublicReport).mockReturnValue({ data: { snapshotData }, isLoading: false, error: null } as any);
  return render(<PublicReport />);
}

/** True when `a` comes before `b` in the document. */
const before = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => vi.clearAllMocks());

describe('public report: coaching insights', () => {
  it('individual: Athlete Information → Coaching Insights → Performance Summary', () => {
    show({ ...individual, coachingInsights: INSIGHTS, coachingInsightsGeneratedAt: '2026-11-02T12:00:00Z' });
    const info = screen.getByText('Athlete Information');
    const insights = screen.getByText('Coaching Insights');
    const perf = screen.getByText('Performance Summary');
    expect(before(info, insights)).toBe(true);
    expect(before(insights, perf)).toBe(true);
    expect(screen.getByText('Great block of work.')).toBeInTheDocument();
    expect(screen.getByText(/Written:\s*Nov [123], 2026/)).toBeInTheDocument();
  });

  it('team: Report Summary → Coaching Insights → Performance Snapshot', () => {
    show({ ...team, coachingInsights: INSIGHTS, coachingInsightsGeneratedAt: '2026-11-02T12:00:00Z' });
    const summary = screen.getByText('Report Summary');
    const insights = screen.getByText('Coaching Insights');
    const snapshot = screen.getByText('Performance Snapshot');
    expect(before(summary, insights)).toBe(true);
    expect(before(insights, snapshot)).toBe(true);
  });

  it('team Report Summary: athletes, period and metrics with units; no team names', () => {
    show(team);
    expect(screen.getByText('Testing Period')).toBeInTheDocument();
    expect(screen.getByText('Current Season')).toBeInTheDocument();
    expect(screen.getByText('3 athletes')).toBeInTheDocument();
    expect(screen.getByText('Vertical Jump (in)')).toBeInTheDocument();
    expect(screen.queryByText('Teams')).toBeNull();
  });

  it.each([['individual', individual], ['team', team]])('%s: no card when there are no insights', (_n, data) => {
    show(data);
    expect(screen.queryByText('Coaching Insights')).toBeNull();
  });

  it.each([['individual', individual], ['team', team]])('%s: never shows a model or AI wording', (_n, data) => {
    const { container } = show({ ...data, coachingInsights: INSIGHTS, coachingInsightsGeneratedAt: '2026-11-02T12:00:00Z' });
    expect(container.textContent).not.toMatch(/\bAI\b|claude|gemini|gpt/i);
  });

  it('eval snapshot is untouched: no insights card', () => {
    show({ reportType: 'eval', model: { athleteName: 'Ben' }, coachingInsights: INSIGHTS });
    expect(screen.getByText('eval body')).toBeInTheDocument();
    expect(screen.queryByText('Coaching Insights')).toBeNull();
  });
});
