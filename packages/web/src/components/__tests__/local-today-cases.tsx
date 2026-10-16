/**
 * Shared cases: "today" defaults and "not in the future" checks use the viewer's
 * LOCAL day, not the UTC day. `now` is chosen so the two differ in the zone
 * under test. Imported by per-timezone test files.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MeasurementForm from '@/components/measurement-form';
import AthleteMeasurementForm from '@/components/athlete-measurement-form';
import WellnessDashboard from '@/pages/wellness-dashboard';
import { SelfEntryForm } from '@/components/athlete/SelfEntryForm';
import { EditMeasurementModal } from '@/components/athlete/EditMeasurementModal';
import { GoalCreationWizard } from '@/components/athlete/GoalCreationWizard';

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'coach-1', role: 'coach' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: vi.fn() }));
vi.mock('@/components/measurement/LastSetContextLine', () => ({ LastSetContextLine: () => null }));
vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: [{ code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ labels: {}, getLabel: (code: string) => code, getUnit: () => '', formats: {}, types: {}, isLoading: false }),
}));
vi.mock('@/hooks/use-wellness-dashboard', () => ({
  useWellnessDashboard: () => ({ data: undefined, isLoading: false, isFetching: false, error: null, refetch: vi.fn(), dataUpdatedAt: 0 }),
}));
vi.mock('@/hooks/use-teams', () => ({ useTeams: () => ({ data: [], isLoading: false }) }));

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => [] } } });
const withClient = (ui: React.ReactElement) => render(<QueryClientProvider client={client()}>{ui}</QueryClientProvider>);

/**
 * @param now      an instant whose local day differs from its UTC day in `zone`
 * @param today    the local day of `now` ('YYYY-MM-DD')
 * @param tomorrow the local day after `today`
 */
export function describeLocalTodayCases(zone: string, now: string, today: string, tomorrow: string) {
  describe(`"today" is the local day (${zone}, ${now})`, () => {
    beforeAll(() => {
      const proto = Element.prototype as any;
      proto.hasPointerCapture ??= () => false;
      proto.setPointerCapture ??= () => {};
      proto.releasePointerCapture ??= () => {};
      proto.scrollIntoView ??= () => {};
    });
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('MeasurementForm defaults the date to the local day', () => {
      withClient(<MeasurementForm />);
      expect(screen.getByTestId('input-measurement-date')).toHaveValue(today);
    });

    it('AthleteMeasurementForm defaults the date to the local day', () => {
      withClient(<AthleteMeasurementForm athleteId="ath-1" athleteName="Jordan Lee" />);
      expect(document.querySelector('input[type="date"]')).toHaveValue(today);
    });

    it('WellnessDashboard defaults the date filter to the local day', () => {
      withClient(<WellnessDashboard organizationId="o1" />);
      const input = screen.getByLabelText('Date');
      expect(input).toHaveValue(today);
      expect(input).toHaveAttribute('max', today);
    });

    it('SelfEntryForm defaults the date and its max to the local day', () => {
      render(<SelfEntryForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
      const dateInput = screen.getByLabelText(/date/i);
      expect(dateInput).toHaveValue(today);
      expect(dateInput).toHaveAttribute('max', today);
    });

    it('SelfEntryForm accepts the local today and rejects the local tomorrow', async () => {
      render(<SelfEntryForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
      const dateInput = screen.getByLabelText(/date/i);
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      await waitFor(() => expect(screen.getAllByText(/required/i).length).toBeGreaterThan(0));
      expect(screen.queryByText(/cannot be in the future/i)).not.toBeInTheDocument();

      fireEvent.change(dateInput, { target: { value: tomorrow } });
      fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      await waitFor(() => expect(screen.getByText(/cannot be in the future/i)).toBeInTheDocument());
    });

    it('EditMeasurementModal accepts the local today and rejects the local tomorrow', async () => {
      const onSave = vi.fn();
      render(
        <EditMeasurementModal
          open
          measurement={{ id: 'm1', metric: 'FLY10_TIME', value: '1.23', date: today, notes: '' } as any}
          onSave={onSave}
          onClose={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(onSave).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText(/date/i), { target: { value: tomorrow } });
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(screen.getByText(/cannot be in the future/i)).toBeInTheDocument());
    });

    it('GoalCreationWizard rejects the local today and accepts the local tomorrow', () => {
      render(
        <GoalCreationWizard
          measurements={[{ metric: 'FLY10_TIME', value: 1.2, date: '2024-01-01' }] as any}
          availableMetrics={['FLY10_TIME']}
          onCreateGoal={vi.fn()}
          onCancel={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /10-Yard Fly/i }));
      fireEvent.click(screen.getByText(/target value/i));
      const dateInput = screen.getByLabelText(/target date/i);
      expect(dateInput).toHaveAttribute('min', today);

      fireEvent.change(dateInput, { target: { value: today } });
      expect(screen.getByText(/date must be in the future/i)).toBeInTheDocument();

      fireEvent.change(dateInput, { target: { value: tomorrow } });
      expect(screen.queryByText(/date must be in the future/i)).not.toBeInTheDocument();
    });
  });
}
