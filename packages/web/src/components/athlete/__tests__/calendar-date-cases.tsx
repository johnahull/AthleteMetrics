/**
 * Shared cases: a stored calendar date ('2026-03-10', measurement/goal date
 * columns) must render as Mar 10 in every viewer timezone. Imported by the
 * per-timezone test files, which set process.env.TZ before any Date use.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormProvider, useForm } from 'react-hook-form';
import { MeasurementHistoryTable } from '../MeasurementHistoryTable';
import { RecentActivityTimeline } from '../RecentActivityTimeline';
import { GoalProgressCard } from '../GoalProgressCard';
import { MetricProgressCard } from '../MetricProgressCard';
import { AthleteHomeHero } from '../AthleteHomeHero';
import { MeasurementsTimeline } from '@/components/measurements-timeline';
import { LastSetContextLine } from '@/components/measurement/LastSetContextLine';
import { GoalStatus, GoalType } from '@/utils/goal-utils';
import AthleteProfile from '@/pages/athlete-profile';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('react-chartjs-2', () => ({ Line: () => <div data-testid="sparkline-chart" /> }));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (code: string) => code, isLoading: false }),
}));

vi.mock('wouter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wouter')>()),
  useParams: () => ({ id: 'u1' }),
  useLocation: () => ['/athletes/u1', vi.fn()],
}));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'c1', role: 'coach' }, organizationContext: null }),
}));
vi.mock('@/hooks/use-available-metrics', () => ({ useAvailableMetrics: () => ({ metrics: [] }) }));
vi.mock('@/components/athlete-modal', () => ({ default: () => null }));
vi.mock('@/components/athlete-measurement-form', () => ({ default: () => null }));
vi.mock('@/components/athletes/LlmExportButton', () => ({ LlmExportButton: () => null }));
vi.mock('@/components/athlete/WellnessStatusCard', () => ({ WellnessStatusCard: () => null }));

const DAY = '2026-03-10';

function measurement(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'm1', userId: 'u1', submittedBy: 'c1', verifiedBy: 'c1', isVerified: true, date: DAY, age: 16,
    metric: 'FLY10_TIME', value: '1.52', units: 's', flyInDistance: null, auxiliaryValue: null, notes: null,
    mediaUrl: null, teamId: null, teamNameSnapshot: null, organizationId: 'o1', season: null,
    teamContextAuto: true, ...overrides,
  };
}

export function describeCalendarDateCases(zone: string, expectNegativeOffset: boolean) {
  describe(`calendar dates render on the stored day (${zone})`, () => {
    afterEach(() => vi.useRealTimers());

    it(`runs in ${zone}`, () => {
      const offset = new Date(2026, 2, 10).getTimezoneOffset();
      expect(expectNegativeOffset ? offset > 0 : offset < 0).toBe(true);
    });

    it('MeasurementHistoryTable shows Mar 10', () => {
      render(<MeasurementHistoryTable measurements={[measurement()]} />);
      expect(screen.getByText('Mar 10, 2026')).toBeInTheDocument();
    });

    it('RecentActivityTimeline shows Mar 10 in full and compact mode', () => {
      const activity = {
        id: 'a1', date: DAY, metric: 'FLY10_TIME', displayName: 'Fly 10', value: 1.52, units: 's',
        insight: null, insightType: null,
      };
      const { unmount } = render(<RecentActivityTimeline activities={[activity]} />);
      expect(screen.getByTestId('activity-date-a1')).toHaveTextContent('Mar 10, 2026');
      unmount();
      render(<RecentActivityTimeline activities={[activity]} compact />);
      expect(screen.getByText('Mar 10')).toBeInTheDocument();
    });

    it('GoalProgressCard shows the target date Mar 10', () => {
      const goal = {
        id: 'g1', userId: 'u1', metric: 'VERTICAL_JUMP', goalType: GoalType.TARGET_VALUE, targetValue: 30,
        baselineValue: 25, currentValue: 27, targetDate: DAY, status: GoalStatus.ACTIVE,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      render(<GoalProgressCard goal={goal} />);
      expect(screen.getByTestId('goal-target-date')).toHaveTextContent('Target: Mar 10, 2026');
    });

    it('MetricProgressCard shows the PR date Mar 10', () => {
      render(
        <MetricProgressCard
          metric="FLY10_TIME"
          displayName="Fly 10"
          units="s"
          measurements={[measurement()]}
          personalRecord={{
            metric: 'FLY10_TIME', displayName: 'Fly 10', value: 1.52, units: 's', date: DAY,
            isRecent: false, improvement: null, improvementText: null,
          }}
        />
      );
      expect(screen.getByText(`(${new Date(2026, 2, 10).toLocaleDateString()})`)).toBeInTheDocument();
    });

    it('MeasurementsTimeline shows Mar 10 for an older measurement', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 3, 1, 12, 0));
      render(
        <MeasurementsTimeline
          measurements={[{ id: 'm1', athleteId: 'u1', athleteName: 'Lucy Ortiz', metricType: 'FLY10_TIME', value: 1.52, date: DAY }]}
        />
      );
      expect(screen.getByText('Mar 10, 2026')).toBeInTheDocument();
    });

    // The prop comes from getLastMeasurementDate(), which is new Date('YYYY-MM-DD') (UTC midnight).
    it('AthleteHomeHero counts days from the stored day', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 2, 11, 12, 0)); // noon local, the day after
      render(<AthleteHomeHero athlete={{ firstName: 'Lucy' } as any} measurementCount={1} lastMeasurementDate={new Date(DAY)} />);
      expect(screen.getByTestId('last-activity')).toHaveTextContent('1 day ago');
    });

    it('LastSetContextLine calls a measurement from the stored day "yesterday"', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 2, 11, 10, 0));
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(['last-set-context', 'u1', 'FLY10_TIME'], {
        measurements: [{ id: 'm1', date: DAY, value: '1.52', units: 's', auxiliaryValue: null, isCalculated: false, calculationMetadata: null }],
      });
      function Harness() {
        const form = useForm();
        return (
          <FormProvider {...form}>
            <LastSetContextLine athleteId="u1" metric={{ code: 'FLY10_TIME', label: 'Fly 10', unit: 's' } as any} />
          </FormProvider>
        );
      }
      render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
      expect(screen.getByTestId('last-set-context')).toHaveTextContent('on yesterday');
    });
  
    it('athlete profile measurement table shows Mar 10', () => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity, queryFn: async () => [] } },
      });
      client.setQueryData(['/api/athletes', 'u1'], { id: 'u1', firstName: 'Lucy', lastName: 'Ortiz', fullName: 'Lucy Ortiz', sports: [], teams: [] });
      client.setQueryData(['/api/measurements', { athleteId: 'u1' }], [measurement()]);
      render(<QueryClientProvider client={client}><AthleteProfile /></QueryClientProvider>);
      expect(screen.getByText(new Date(2026, 2, 10).toLocaleDateString())).toBeInTheDocument();
    });
  });
}
