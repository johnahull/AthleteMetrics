import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeviceImportDialog } from '../DeviceImportDialog';
import type { DrillResult, PreviewAthlete } from '@/hooks/useDeviceImport';

// Run A: faster 30 yd. Run B (earlier): faster 10 / 20 yd splits. Plus a derived fly and RSI, which are not runs.
const DASHES: DrillResult[] = [
  {
    metric: 'DASH_30YD', value: 4.4, units: 's', runIndex: 1, runAt: '2026-10-20T09:05:00',
    splits: [{ metric: 'DASH_10YD', value: 1.8, units: 's' }, { metric: 'DASH_20YD', value: 3.1, units: 's' }],
  },
  {
    metric: 'DASH_30YD', value: 4.5, units: 's', runIndex: 0, runAt: '2026-10-20T09:00:00',
    splits: [{ metric: 'DASH_10YD', value: 1.7, units: 's' }, { metric: 'DASH_20YD', value: 3.0, units: 's' }],
  },
  { metric: 'FLY10_TIME', value: 1.3, units: 's', runIndex: 0, derivedFrom: 'DASH_30YD splits' },
  { metric: 'RSI', value: 1.9, units: '', runIndex: 0 },
];

const athlete = (drills: DrillResult[]): PreviewAthlete => ({
  csvName: 'Ana Runs',
  firstName: 'Ana',
  lastName: 'Runs',
  matchType: 'exact',
  matchConfidence: 1,
  included: true,
  drills,
});

const hook = { step: 'review', drills: DASHES };

vi.mock('@/hooks/useDeviceImport', () => ({
  useDeviceImport: () => ({
    step: hook.step,
    preview: {
      athletes: [athlete(hook.drills)],
      summary: { totalAthletes: 1, exactMatches: 1, fuzzyMatches: 0, partialMatches: 0, unmatched: 0, totalDrills: hook.drills.length, outlierCount: 0 },
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
  useMetricLabels: () => ({
    getLabel: (code: string) => code,
    types: { DASH_30YD: 'lower_is_better', TST_HIGH: 'higher_is_better' },
  }),
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  hook.step = 'review';
  hook.drills = DASHES;
  // The org athlete list for the "Assign To" dropdown
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })));
});

const renderDialog = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeviceImportDialog open onOpenChange={() => {}} organizationId="org-1" />
    </QueryClientProvider>,
  );

const expandRow = async () => {
  const row = screen.getByText('Ana Runs').closest('tr')!;
  await userEvent.click(within(row).getAllByRole('button')[0]);
};

describe('DeviceImportDialog review step with several runs', () => {
  it('lists every run of a drill with its splits and marks the best per metric and per split code', async () => {
    renderDialog();
    // 2 dash runs; the derived fly and RSI are not runs
    expect(screen.getByText('2 runs')).toBeTruthy();

    await expandRow();

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

  it("takes the best direction from the metric's type, not from its units", async () => {
    hook.drills = [
      { metric: 'TST_HIGH', value: 1, units: 's', runIndex: 0, runAt: '2026-10-20T09:00:00' },
      { metric: 'TST_HIGH', value: 2, units: 's', runIndex: 1, runAt: '2026-10-20T09:05:00' },
    ];
    renderDialog();
    await expandRow();
    const best = within(screen.getByTestId('runs-TST_HIGH')).getByText('Best');
    expect(within(best.parentElement!).getByText(/^2/)).toBeTruthy();
  });

  it('counts runs on the confirm step without derived flies or RSI', () => {
    hook.step = 'confirm';
    renderDialog();
    const label = screen.getByText('Runs (every attempt is kept)');
    expect(label.parentElement!.textContent).toContain('2');
    expect(label.parentElement!.textContent).not.toContain('4');
  });

  it('explains that duplicates are matched per run time on the confirm step', () => {
    hook.step = 'confirm';
    renderDialog();
    expect(
      screen.getByText('Runs already imported (same athlete, date, drill and run time) are skipped. New run times are added.'),
    ).toBeTruthy();
    expect(screen.getByText('Runs already imported with the same run time are replaced. Other earlier runs are kept.')).toBeTruthy();
    expect(screen.queryByText(/all of its new runs are skipped/)).toBeNull();
  });
});
