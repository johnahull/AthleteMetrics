import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TeamRadarSection } from '../TeamRadarSection';
import type { AthleteRanking } from '@/types/report-types';

// Mock useMetricConfig (used inside RadarChart) to avoid needing a QueryClientProvider.
vi.mock('@/hooks/use-metric-config', () => ({
  useMetricConfig: () => ({
    getMetricConfig: (code: string) => ({
      label: code,
      unit: '',
      metricType: 'higher_is_better',
      lowerIsBetter: false,
    }),
    isLoaded: true,
    metricsMap: {},
  }),
}));

// Mock Chart.js's Radar to avoid canvas rendering in happy-dom.
vi.mock('react-chartjs-2', () => ({
  Radar: vi.fn(({ data }: any) => (
    <div data-testid="mock-radar">
      <div data-testid="radar-datasets">{data.datasets?.length ?? 0}</div>
    </div>
  )),
}));

const rankings: AthleteRanking[] = [
  { userId: 'u1', userName: 'A', measurements: { VJ: 26, DASH: 4.8, AGI: 2.5 }, percentiles: { VJ: 80, DASH: 60, AGI: 70 } },
  { userId: 'u2', userName: 'B', measurements: { VJ: 24, DASH: 5.0, AGI: 2.6 }, percentiles: { VJ: 60, DASH: 40, AGI: 50 } },
];

describe('TeamRadarSection', () => {
  it('renders the team radar chart (tagged for PDF capture) when gated on with >=3 metrics and rankings present', () => {
    render(<TeamRadarSection rankings={rankings} metrics={['VJ', 'DASH', 'AGI']} />);
    expect(screen.getByText('Team All-Around Profile (percentiles)')).toBeInTheDocument();
    expect(screen.getByTestId('mock-radar')).toBeInTheDocument();
    expect(document.querySelector('[data-report-chart="radar"]')).toBeTruthy();
  });

  it('renders nothing when fewer than 3 metrics are configured', () => {
    const { container } = render(<TeamRadarSection rankings={rankings} metrics={['VJ', 'DASH']} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no rankings', () => {
    const { container } = render(<TeamRadarSection rankings={[]} metrics={['VJ', 'DASH', 'AGI']} />);
    expect(container).toBeEmptyDOMElement();
  });
});
