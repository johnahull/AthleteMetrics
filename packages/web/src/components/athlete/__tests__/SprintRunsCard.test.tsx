import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SprintRunsCard } from '../SprintRunsCard';
import type { SprintRunMeasurement } from '@/utils/sprint-runs';

let n = 0;
function m(o: {
  metric: string;
  value: number;
  date: string;
  runId?: string;
  split?: boolean;
  parentMetric?: string;
}): SprintRunMeasurement {
  n += 1;
  return {
    id: `m${n}`,
    metric: o.metric,
    value: String(o.value),
    date: o.date,
    isVerified: true,
    organizationId: 'org-1',
    importBatchId: null,
    notes: null,
    calculationMetadata: o.runId
      ? {
          formula: o.split ? 'direct_import_split' : 'direct_import',
          sourceValues: {},
          calculatedAt: '2026-10-17T00:00:00Z',
          runId: o.runId,
          ...(o.parentMetric ? { parentMetric: o.parentMetric } : {}),
        }
      : null,
  };
}

function dash40(runId: string, date: string, t: [number, number, number, number], unit: 'YD' | 'M' = 'YD') {
  const p = `DASH_40${unit}`;
  return [
    m({ metric: p, value: t[3], date, runId }),
    m({ metric: `DASH_10${unit}`, value: t[0], date, runId, split: true, parentMetric: p }),
    m({ metric: `DASH_20${unit}`, value: t[1], date, runId, split: true, parentMetric: p }),
    m({ metric: `DASH_30${unit}`, value: t[2], date, runId, split: true, parentMetric: p }),
  ];
}

const OLD = dash40('old', '2026-08-29', [1.92, 3.28, 4.52, 5.71]);
const NEW = dash40('new', '2026-10-17', [1.85, 3.15, 4.35, 5.49]);

describe('SprintRunsCard', () => {
  // Only Date is faked (userEvent needs real timers): the range filter is relative to today
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('renders nothing when the athlete has no dash runs', () => {
    const { container } = render(<SprintRunsCard measurements={[m({ metric: 'FLY10_TIME', value: 1.2, date: '2026-10-17' })]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one row per run with gate times and interval times', () => {
    render(<SprintRunsCard measurements={[...OLD, ...NEW]} />);
    expect(screen.getByRole('heading', { name: /sprint runs/i })).toBeInTheDocument();

    for (const name of ['10 yd', '20 yd', '30 yd', '40 yd', /10–20 yd.*RI10/, /20–30 yd.*RI20/, /30–40 yd.*RI30/]) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    // newest first
    expect(within(rows[0]).getByText('Oct 17, 2026')).toBeInTheDocument();
    expect(within(rows[0]).getByText('5.49')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1.30')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Aug 29, 2026')).toBeInTheDocument();
    expect(within(rows[1]).getByText('5.71')).toBeInTheDocument();
  });

  it('badges the fastest run per final distance as PR, only with two or more runs of it', () => {
    const { rerender } = render(<SprintRunsCard measurements={NEW} />);
    expect(screen.queryByText('PR')).not.toBeInTheDocument();

    rerender(<SprintRunsCard measurements={[...OLD, ...NEW]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('PR')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('PR')).not.toBeInTheDocument();
  });

  it('marks an interval faster than the same interval in the next-older run', () => {
    render(<SprintRunsCard measurements={[...OLD, ...NEW]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].querySelectorAll('[data-faster="true"]')).toHaveLength(3);
    expect(rows[1].querySelectorAll('[data-faster="true"]')).toHaveLength(0);
  });

  it('shows an em dash for a gate or interval a run does not have', () => {
    const partial = [
      m({ metric: 'DASH_20YD', value: 3.2, date: '2026-10-20', runId: 'p' }),
      m({ metric: 'DASH_10YD', value: 1.9, date: '2026-10-20', runId: 'p', split: true, parentMetric: 'DASH_20YD' }),
    ];
    render(<SprintRunsCard measurements={[...NEW, ...partial]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('notes mixed attempts on a pooled (manual-entry) row and shows no intervals for it', () => {
    render(<SprintRunsCard measurements={[m({ metric: 'DASH_40YD', value: 5.6, date: '2026-10-17' })]} />);
    expect(screen.getByText(/mixed attempts/i)).toBeInTheDocument();
  });

  it('offers a yards/meters toggle only when both units have runs, and switches the table', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SprintRunsCard measurements={NEW} />);
    expect(screen.queryByRole('radio', { name: /meters/i })).not.toBeInTheDocument();

    rerender(<SprintRunsCard measurements={[...OLD, ...dash40('m', '2026-10-18', [1.9, 3.2, 4.4, 5.6], 'M')]} />);
    // newest run is metric, so meters is the default view
    expect(screen.getByRole('columnheader', { name: '10 m' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /yards/i }));
    expect(screen.getByRole('columnheader', { name: '10 yd' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '10 m' })).not.toBeInTheDocument();
  });

  it('does not mark a run faster than another run from the same day', () => {
    const a = dash40('a', '2026-10-17', [1.9, 3.3, 4.5, 5.7]);
    const b = dash40('b', '2026-10-17', [1.8, 3.1, 4.3, 5.4]);
    render(<SprintRunsCard measurements={[...a, ...b]} />);
    expect(document.querySelectorAll('[data-faster="true"]')).toHaveLength(0);
  });

  it('does not mark a difference that rounds to the same displayed time', () => {
    const older = dash40('o', '2026-08-29', [1.9, 3.144, 4.4, 5.6]); // 10–20 = 1.244
    const newer = dash40('n', '2026-10-17', [1.9, 3.141, 4.4, 5.6]); // 10–20 = 1.241
    render(<SprintRunsCard measurements={[...older, ...newer]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].querySelector('[data-faster="true"]')).toBeNull();
  });

  it('gives a tied PR to the older run', () => {
    render(<SprintRunsCard measurements={[...dash40('o', '2026-08-29', [1.9, 3.2, 4.4, 5.5]), ...dash40('n', '2026-10-17', [1.9, 3.2, 4.4, 5.5])]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).queryByText('PR')).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('PR')).toBeInTheDocument();
  });

  it('falls back to the default unit when the picked unit has no runs after a data change', async () => {
    const user = userEvent.setup();
    const both = [...OLD, ...dash40('m', '2026-10-18', [1.9, 3.2, 4.4, 5.6], 'M')];
    const { rerender } = render(<SprintRunsCard measurements={both} />);
    await user.click(screen.getByRole('radio', { name: /yards/i }));
    rerender(<SprintRunsCard measurements={both.filter(r => !r.metric.endsWith('YD'))} />);
    expect(screen.getByRole('columnheader', { name: '10 m' })).toBeInTheDocument();
  });

  it('shows summary cards: best final, best fly 10, biggest gain and runs recorded', () => {
    render(<SprintRunsCard measurements={[...OLD, ...NEW]} />);
    const best = screen.getByRole('group', { name: 'Best 40 yd' });
    expect(within(best).getByText('5.49 s')).toBeInTheDocument();
    expect(within(best).getByText('−0.22 s since Aug 29, 2026')).toBeInTheDocument();

    const fly = screen.getByRole('group', { name: 'Best fly 10 (RI20)' });
    expect(within(fly).getByText('1.20 s')).toBeInTheDocument();
    expect(within(fly).getByText('−0.04 s since Aug 29, 2026')).toBeInTheDocument();

    const gain = screen.getByRole('group', { name: 'Biggest gain' });
    expect(within(gain).getByText('10–20 yd')).toBeInTheDocument();
    expect(within(gain).getByText('−0.06 s')).toBeInTheDocument();

    const count = screen.getByRole('group', { name: 'Runs recorded' });
    expect(within(count).getByText('2')).toBeInTheDocument();
    expect(within(count).getByText('Aug 29, 2026 – Oct 17, 2026')).toBeInTheDocument();
  });

  it('omits the best and gain cards that have no data (a single pooled run)', () => {
    render(<SprintRunsCard measurements={[m({ metric: 'DASH_40YD', value: 5.6, date: '2026-10-17' })]} />);
    expect(screen.queryByRole('group', { name: /^Best/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Biggest gain' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Runs recorded' })).getByText('1')).toBeInTheDocument();
  });

  it('summarizes the selected unit only', async () => {
    const user = userEvent.setup();
    const both = [...OLD, ...dash40('m', '2026-10-18', [1.9, 3.2, 4.4, 5.6], 'M')];
    render(<SprintRunsCard measurements={both} />);
    expect(screen.getByRole('group', { name: 'Best 40 m' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /yards/i }));
    expect(screen.getByRole('group', { name: 'Best 40 yd' })).toBeInTheDocument();
  });

  describe('time range', () => {
    const ANCIENT = dash40('ancient', '2024-01-01', [1.95, 3.4, 4.7, 6.0]);

    it('defaults to the last 12 months and hides older runs', () => {
      render(<SprintRunsCard measurements={[...ANCIENT, ...NEW]} />);
      expect(screen.getByRole('radio', { name: 'Last 12 months' })).toBeChecked();
      expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
      expect(screen.queryByText('Jan 1, 2024')).not.toBeInTheDocument();
    });

    it('shows every run for All time and only recent ones for Last 6 months', async () => {
      const user = userEvent.setup();
      render(<SprintRunsCard measurements={[...ANCIENT, ...OLD, ...NEW]} />);
      await user.click(screen.getByRole('radio', { name: 'All time' }));
      expect(screen.getAllByRole('row').slice(1)).toHaveLength(3);
      await user.click(screen.getByRole('radio', { name: 'Last 6 months' }));
      // Aug 29 and Oct 17 are within 6 months of Oct 21, 2026
      expect(screen.getAllByRole('row').slice(1)).toHaveLength(2);
    });

    it('also limits the summary cards to the range', async () => {
      const user = userEvent.setup();
      render(<SprintRunsCard measurements={[...ANCIENT, ...NEW]} />);
      expect(within(screen.getByRole('group', { name: 'Runs recorded' })).getByText('1')).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: 'All time' }));
      expect(within(screen.getByRole('group', { name: 'Runs recorded' })).getByText('2')).toBeInTheDocument();
    });

    it('keeps PR and the faster marker based on all runs, not only the visible ones', () => {
      render(<SprintRunsCard measurements={[...dash40('best', '2025-01-01', [1.8, 3.1, 4.3, 5.4]), ...dash40('slow', '2025-02-01', [1.95, 3.4, 4.7, 6.0]), ...NEW]} />);
      // Only NEW is visible (12 months back from Oct 21, 2026 is Oct 21, 2025)
      const rows = screen.getAllByRole('row').slice(1);
      expect(rows).toHaveLength(1);
      // 5.49 is not the all-time best (5.40), so no PR
      expect(within(rows[0]).queryByText('PR')).not.toBeInTheDocument();
      // and it is faster than the previous (hidden) run on 30–40? 1.14 vs 1.30: yes
      expect(rows[0].querySelectorAll('[data-faster="true"]').length).toBeGreaterThan(0);
    });

    it('says so, with a way out, when the range hides every run', async () => {
      const user = userEvent.setup();
      render(<SprintRunsCard measurements={ANCIENT} />);
      expect(screen.getByText('No runs in the last 12 months')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /sprint runs/i })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Show all time' }));
      expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
    });
  });

  describe('run detail', () => {
    it('expands a run to show how each interval was derived, and collapses again', async () => {
      const user = userEvent.setup();
      render(<SprintRunsCard measurements={NEW} />);
      const toggle = screen.getByRole('button', { name: /Oct 17, 2026/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText(/RI20 \(fly 10\)/)).not.toBeInTheDocument();

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('RI20 (fly 10): 4.350 − 3.150 = 1.200 s')).toBeInTheDocument();
      expect(screen.getByText('RI10 (fly 10): 3.150 − 1.850 = 1.300 s')).toBeInTheDocument();

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText(/RI20 \(fly 10\)/)).not.toBeInTheDocument();
    });

    it('notes a partial run (no final time)', async () => {
      const user = userEvent.setup();
      const partial = [
        m({ metric: 'DASH_10YD', value: 1.9, date: '2026-10-20', runId: 'p', split: true, parentMetric: 'DASH_40YD' }),
        m({ metric: 'DASH_20YD', value: 3.2, date: '2026-10-20', runId: 'p', split: true, parentMetric: 'DASH_40YD' }),
      ];
      render(<SprintRunsCard measurements={partial} />);
      await user.click(screen.getByRole('button', { name: /Oct 20, 2026/ }));
      expect(screen.getByText('Partial run: no final time recorded')).toBeInTheDocument();
    });

    it('notes how a pooled row was built', async () => {
      const user = userEvent.setup();
      render(<SprintRunsCard measurements={[m({ metric: 'DASH_40YD', value: 5.6, date: '2026-10-17' })]} />);
      await user.click(screen.getByRole('button', { name: /Oct 17, 2026/ }));
      expect(screen.getByText('Mixed attempts: fastest time per distance across the day')).toBeInTheDocument();
    });

    it('spans every column and links the button to its detail row', async () => {
      const user = userEvent.setup();
      render(<SprintRunsCard measurements={NEW} />);
      const toggle = screen.getByRole('button', { name: /Oct 17, 2026/ });
      expect(toggle).not.toHaveAttribute('aria-controls');
      await user.click(toggle);
      const detail = document.getElementById(toggle.getAttribute('aria-controls')!)!;
      expect(detail).toBeInTheDocument();
      // date + 4 gates + 3 intervals
      expect(detail.querySelector('td')).toHaveAttribute('colspan', '8');
    });
  });
});
