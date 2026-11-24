import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeviceImportDialog } from '../DeviceImportDialog';
import type { PreviewAthlete } from '@/hooks/useDeviceImport';

// Run A: faster 30 yd. Run B (earlier): faster 10 / 20 yd splits.
const athlete: PreviewAthlete = {
  csvName: 'Ana Runs',
  firstName: 'Ana',
  lastName: 'Runs',
  matchType: 'exact',
  matchConfidence: 1,
  included: true,
  drills: [
    {
      metric: 'DASH_30YD', value: 4.4, units: 's', runIndex: 1, runAt: '2026-10-20T09:05:00',
      splits: [{ metric: 'DASH_10YD', value: 1.8, units: 's' }, { metric: 'DASH_20YD', value: 3.1, units: 's' }],
    },
    {
      metric: 'DASH_30YD', value: 4.5, units: 's', runIndex: 0, runAt: '2026-10-20T09:00:00',
      splits: [{ metric: 'DASH_10YD', value: 1.7, units: 's' }, { metric: 'DASH_20YD', value: 3.0, units: 's' }],
    },
  ],
};

vi.mock('@/hooks/useDeviceImport', () => ({
  useDeviceImport: () => ({
    step: 'review',
    preview: {
      athletes: [athlete],
      summary: { totalAthletes: 1, exactMatches: 1, fuzzyMatches: 0, partialMatches: 0, unmatched: 0, totalDrills: 2, outlierCount: 0 },
    },
    sessions: [],
    warnings: [],
    commitResult: null,
    selectedSessionDate: null,
    athleteOverrides: {},
    parseMutation: { mutate: vi.fn(), isPending: false },
    commitMutation: { mutate: vi.fn(), isPending: false },
    rollbackMutation: { mutate: vi.fn(), isPending: false },
    setStep: vi.fn(),
    goBack: vi.fn(),
    reset: vi.fn(),
    setSelectedSessionDate: vi.fn(),
    setAthleteOverride: vi.fn(),
    setAthleteIncluded: vi.fn(),
  }),
}));

vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ getLabel: (code: string) => code }),
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe('DeviceImportDialog review step with several runs', () => {
  it('lists every run of a drill with its splits and marks the best per metric and per split code', async () => {
    // The org athlete list for the "Assign To" dropdown
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DeviceImportDialog open onOpenChange={() => {}} organizationId="org-1" />
      </QueryClientProvider>,
    );
    expect(screen.getByText('2 runs')).toBeTruthy();

    // Expand the athlete row
    const row = screen.getByText('Ana Runs').closest('tr')!;
    await userEvent.click(within(row).getAllByRole('button')[0]);

    const group = screen.getByTestId('runs-DASH_30YD');
    expect(within(group).getByText('(2 runs)')).toBeTruthy();
    const lines = within(group).getAllByText(/^09:0\d:00$/).map((el) => el.parentElement!);
    // Ordered by runIndex: B (09:00) then A (09:05)
    expect(lines.map((l) => within(l).getAllByText(/^09:0/)[0].textContent)).toEqual(['09:00:00', '09:05:00']);
    const [b, a] = lines;
    // A has the best 30 yd; B has the best 10 and 20 yd splits
    expect(within(a).getAllByText('Best')).toHaveLength(1);
    expect(within(b).getAllByText('Best')).toHaveLength(2);
  });
});
