import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TierDistributionChartSection } from '../TierDistributionChartSection';
import type { TierDistribution } from '@shared/benchmark-utils';

vi.mock('react-chartjs-2', () => ({
  Bar: vi.fn(({ data }: any) => (
    <div data-testid="mock-stacked-bar">
      <div data-testid="stacked-bar-datasets">{data.datasets?.length ?? 0}</div>
    </div>
  )),
}));

const tierDistributions: TierDistribution[] = [
  {
    metricCode: 'VJ',
    tierGroupName: 'Vertical Jump Tiers',
    tiers: [
      { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, count: 2 },
      { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, count: 5 },
      { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, count: 1 },
    ],
  },
];

describe('TierDistributionChartSection', () => {
  it('renders a stacked bar chart (one dataset per distinct tier) when tier distributions are present', () => {
    render(<TierDistributionChartSection tierDistributions={tierDistributions} metricLabels={{ VJ: 'Vertical Jump' }} />);
    expect(screen.getByText('Tier Distribution')).toBeInTheDocument();
    expect(screen.getByTestId('mock-stacked-bar')).toBeInTheDocument();
    expect(screen.getByTestId('stacked-bar-datasets')).toHaveTextContent('3');
    expect(document.querySelector('[data-report-chart="tierDistribution"]')).toBeTruthy();
  });

  it('renders nothing when there are no tier distributions', () => {
    const { container } = render(<TierDistributionChartSection tierDistributions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
