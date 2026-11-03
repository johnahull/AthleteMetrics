import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SprintRunsCard } from '../SprintRunsCard';
import type { SprintRunMeasurement } from '@/utils/sprint-runs';

let n = 0;
function m(metric: string, value: number, date: string, runId: string, parentMetric?: string): SprintRunMeasurement {
  n += 1;
  return {
    metric,
    value: String(value),
    date,
    isVerified: true,
    organizationId: 'org-1',
    importBatchId: null,
    notes: null,
    calculationMetadata: {
      formula: parentMetric ? 'direct_import_split' : 'direct_import',
      runId,
      ...(parentMetric ? { parentMetric } : {}),
    },
  };
}

/** A 20 yd (or m) drill with a 10 split: two gates and one interval */
function run(runId: string, date: string, t10: number, t20: number, unit: 'YD' | 'M' = 'YD') {
  return [m(`DASH_20${unit}`, t20, date, runId), m(`DASH_10${unit}`, t10, date, runId, `DASH_20${unit}`)];
}

const day = (i: number) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`;

describe('SprintRunsCard reportMode', () => {
  // The dashboard's default 12 month window is relative to today; report mode must ignore it
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('shows every run it is given, with no range, unit or expand controls', () => {
    render(<SprintRunsCard reportMode measurements={[...run('a', '2024-01-05', 1.9, 3.3), ...run('b', '2026-10-01', 1.8, 3.2)]} />);
    expect(screen.getByText('Jan 5, 2024')).toBeInTheDocument();
    expect(screen.getByText('Oct 1, 2026')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Time range' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Distance unit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders yards and meters one after the other when the athlete has both', () => {
    const { container } = render(
      <SprintRunsCard reportMode measurements={[...run('a', '2026-09-01', 1.9, 3.3), ...run('b', '2026-09-02', 2.0, 3.5, 'M')]} />,
    );
    expect(screen.getByRole('columnheader', { name: '20 yd' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '20 m' })).toBeInTheDocument();
    const titles = [...container.querySelectorAll('[data-report-chart-title]')].map(e => e.getAttribute('data-report-chart-title'));
    expect(titles.some(t => t?.includes('Yards'))).toBe(true);
    expect(titles.some(t => t?.includes('Meters'))).toBe(true);
  });

  it('marks a summary block and table blocks for the PDF capture, none nested in another', () => {
    const { container } = render(<SprintRunsCard reportMode measurements={[...run('a', '2026-09-01', 1.9, 3.3)]} />);
    const blocks = [...container.querySelectorAll<HTMLElement>('[data-report-chart]')];
    expect(blocks.map(b => b.getAttribute('data-report-chart'))).toEqual(['sprintRuns:YD:summary', 'sprintRuns:YD:table:1']);
    for (const a of blocks) for (const b of blocks) if (a !== b) expect(a.contains(b)).toBe(false);
  });

  it('splits a long table into blocks of at most 12 runs, each with its own header', () => {
    const many = Array.from({ length: 30 }, (_, i) => run(`r${i}`, day(i), 1.9, 3.3)).flat();
    const { container } = render(<SprintRunsCard reportMode measurements={many} />);
    const tables = [...container.querySelectorAll<HTMLElement>('[data-report-chart^="sprintRuns:YD:table"]')];
    expect(tables).toHaveLength(3);
    expect(tables.map(t => within(t).getAllByRole('row').length - 1)).toEqual([12, 12, 6]);
    for (const t of tables) expect(within(t).getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
  });

  it('shows the newest 48 runs of a unit and says how many were left out', () => {
    const many = Array.from({ length: 60 }, (_, i) => run(`r${i}`, day(i), 1.9, 3.3)).flat();
    const { container } = render(<SprintRunsCard reportMode measurements={many} />);
    expect(container.querySelectorAll('[data-report-chart^="sprintRuns:YD:table"]')).toHaveLength(4);
    expect(screen.getByText(/Showing the newest 48 of 60 runs/)).toBeInTheDocument();
  });

  it('names each table block, since the blocks share one heading', () => {
    const many = Array.from({ length: 30 }, (_, i) => run(`r${i}`, day(i), 1.9, 3.3)).flat();
    render(<SprintRunsCard reportMode measurements={many} />);
    expect(screen.getByRole('table', { name: 'Sprint runs — Yards (2 of 3)' })).toBeInTheDocument();
  });

  it('still badges the fastest run in the given window as PR', () => {
    render(<SprintRunsCard reportMode measurements={[...run('a', '2026-09-01', 1.9, 3.4), ...run('b', '2026-09-08', 1.8, 3.2)]} />);
    expect(screen.getAllByText('PR')).toHaveLength(1);
  });

  it('does not add capture markers on the dashboard', () => {
    const { container } = render(<SprintRunsCard measurements={[...run('a', '2026-09-01', 1.9, 3.3)]} />);
    expect(container.querySelector('[data-report-chart]')).toBeNull();
  });
});
