import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeamTrendSection } from '../TeamTrendSection';
import type { TeamReportTrends } from '@shared/report-trends-types';

// Mock Chart.js's Line to avoid canvas rendering in happy-dom.
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(({ data }: any) => (
    <div data-testid="mock-line">
      <div data-testid="line-datasets">{data.datasets?.length ?? 0}</div>
    </div>
  )),
}));

const trends: TeamReportTrends = {
  VJ: {
    teamSeries: [
      { date: '2024-01-01', value: 24 },
      { date: '2024-02-01', value: 26 },
    ],
    athleteSeries: [
      { athleteId: 'u1', athleteName: 'A', series: [{ date: '2024-01-01', value: 25 }, { date: '2024-02-01', value: 27 }] },
    ],
    direction: 'higher',
    delta: { from: 24, to: 26, pct: 8.3 },
    benchmark: { kind: 'none' },
  },
};

describe('TeamTrendSection', () => {
  it('renders the team trend section (team-average bold line + faint background series) when trends present', () => {
    render(<TeamTrendSection trends={trends} metricLabels={{ VJ: 'Vertical Jump' }} />);
    expect(screen.getByTestId('team-trend-section')).toBeInTheDocument();
    expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
    expect(screen.getByTestId('mock-line')).toBeInTheDocument();
    // Main dataset + 1 background athlete series = 2 datasets.
    expect(screen.getByTestId('line-datasets')).toHaveTextContent('2');
    expect(document.querySelector('[data-chart-metric="VJ"]')).toBeTruthy();
  });

  it('renders nothing when trends is empty', () => {
    const { container } = render(<TeamTrendSection trends={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
