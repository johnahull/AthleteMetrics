import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeamBoxSwarmSection } from '../TeamBoxSwarmSection';
import type { TeamReportDistributions } from '@shared/report-trends-types';

vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({
      label: code,
      unit: 'in',
      metricType: 'higher_is_better',
      lowerIsBetter: false,
    }),
    isLoaded: true,
    metricsMap: {},
  }),
}));

// BoxPlotChart uses <Chart> — mock to avoid canvas rendering.
vi.mock('react-chartjs-2', () => ({
  Chart: vi.fn(() => <div data-testid="mock-boxplot" />),
}));

const distributions: TeamReportDistributions = {
  VJ: {
    values: [20, 24, 28],
    athletes: [
      { athleteId: 'u1', athleteName: 'A', value: 20 },
      { athleteId: 'u2', athleteName: 'B', value: 24 },
      { athleteId: 'u3', athleteName: 'C', value: 28 },
    ],
    stats: { min: 20, q1: 22, median: 24, q3: 26, max: 28 },
    teamAverage: 24,
    direction: 'higher',
  },
};

describe('TeamBoxSwarmSection', () => {
  it('renders a box plot (with every athlete as a point) per metric when distributions are present', () => {
    render(<TeamBoxSwarmSection distributions={distributions} metricLabels={{ VJ: 'Vertical Jump' }} generatedAt="2024-01-01" />);
    expect(screen.getByText('Team Distribution')).toBeInTheDocument();
    expect(screen.getByTestId('mock-boxplot')).toBeInTheDocument();
    expect(document.querySelector('[data-report-chart="boxswarm:VJ"]')).toBeTruthy();
  });

  it('gives the box plot a wrapper tall enough for its own 400px content minimum (regression: a shorter wrapper forced BoxPlotChart into its internal scroll fallback)', () => {
    render(<TeamBoxSwarmSection distributions={distributions} metricLabels={{ VJ: 'Vertical Jump' }} generatedAt="2024-01-01" />);
    // BoxPlotChart's own JSX nests several wrapper divs around the (mocked)
    // Chart canvas, so walk up to the ancestor with the height class rather
    // than assume it's the immediate parent.
    const heightWrapper = screen.getByTestId('mock-boxplot').closest('[class*="h-[480px]"]');
    expect(heightWrapper).toBeTruthy();
  });

  it('renders nothing when distributions is empty', () => {
    const { container } = render(<TeamBoxSwarmSection distributions={{}} generatedAt="2024-01-01" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('skips a metric with fewer than 2 athletes (nothing meaningful to plot)', () => {
    const oneAthlete: TeamReportDistributions = {
      VJ: { ...distributions.VJ, athletes: [distributions.VJ.athletes[0]], values: [20] },
    };
    const { container } = render(<TeamBoxSwarmSection distributions={oneAthlete} generatedAt="2024-01-01" />);
    expect(container).toBeEmptyDOMElement();
  });
});
