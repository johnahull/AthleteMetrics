import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { TierProgressChart } from '../TierProgressChart';
import type { BenchmarkComparison } from '@shared/benchmark-types';

const comparison: BenchmarkComparison = {
  benchmarkName: 'VJ',
  benchmarkValue: 26,
  athleteValue: 25.5,
  meetsOrExceeds: true,
  percentageDiff: 0,
  comparisonOperator: 'range',
  tierName: 'Varsity',
  tierColor: '#86efac',
  tierOrder: 2,
  distanceToNextTier: 2.5,
  nextTierName: 'Elite',
  isBestTier: false,
  allTiers: [
    { tierName: 'JV', tierColor: '#fde68a', tierOrder: 3, minValue: 20, maxValue: 24 },
    { tierName: 'Varsity', tierColor: '#86efac', tierOrder: 2, minValue: 24, maxValue: 28 },
    { tierName: 'Elite', tierColor: '#fbbf24', tierOrder: 1, minValue: 28, maxValue: 32 },
  ],
};

describe('TierProgressChart', () => {
  it('renders the base marker with no athleteValues prop (individual-report usage, unaffected)', () => {
    render(<TierProgressChart label="Vertical Jump" metricCode="VJ" comparison={comparison} unit="in" />);
    expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid^="tier-marker-"]').length).toBe(1);
    expect(document.querySelector('[data-testid="tier-marker-self"]')).toBeTruthy();
    expect(screen.queryByText(/individual athlete/i)).not.toBeInTheDocument();
  });

  it('renders an additional marker per athlete when athleteValues is provided', () => {
    const athleteValues = [
      { athleteId: 'a1', athleteName: 'Jordan Smith', value: 22 },
      { athleteId: 'a2', athleteName: 'Alex Lee', value: 30 },
    ];
    render(
      <TierProgressChart
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={athleteValues}
      />
    );
    expect(document.querySelectorAll('[data-testid^="tier-marker-"]').length).toBe(3);
    expect(document.querySelector('[data-testid="tier-marker-team-average"]')).toBeTruthy();
    athleteValues.forEach((a) => {
      expect(document.querySelector(`[data-testid="tier-marker-${a.athleteId}"]`)).toBeTruthy();
    });
  });

  it('captions the value as "Team Average" (not "You") when athleteValues is present (regression: caption previously hardcoded "You" even for team-average data)', () => {
    render(
      <TierProgressChart
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 22 }]}
      />
    );
    expect(screen.getByText(/Team Average: 25.5 in/)).toBeInTheDocument();
    expect(screen.queryByText(/^You:/)).not.toBeInTheDocument();
  });

  it('shows a legend cue distinguishing team average vs individual athletes when athleteValues is present', () => {
    render(
      <TierProgressChart
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 22 }]}
      />
    );
    // Scoped to the exact legend text — the caption line above it also now
    // legitimately contains "Team Average" (the fixed caption label), so a
    // loose /team average/i match would ambiguously match both.
    expect(screen.getByText('Bold marker = team average; small dots = individual athletes')).toBeInTheDocument();
  });

  it('shows a hover tooltip with the athlete name, value, and report date range for each individual marker', async () => {
    const user = userEvent.setup();
    render(
      <TierProgressChart
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 22 }]}
        rangeLabel="Jan 1 – Jun 30, 2026"
      />
    );
    const marker = document.querySelector('[data-testid="tier-marker-a1"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      // Clarifies that each plotted athlete value is their best performance
      // within the report's timeframe (see TeamBenchmarkStandingSection).
      expect(screen.getByRole('tooltip')).toHaveTextContent('Jordan Smith: 22 in (best within Jan 1 – Jun 30, 2026)');
    });
  });

  it('omits the date-range parenthetical from the tooltip when no rangeLabel is supplied (regression: previously said "(best in range)" unconditionally, even with no range shown anywhere on the page)', async () => {
    const user = userEvent.setup();
    render(
      <TierProgressChart
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 22 }]}
      />
    );
    const marker = document.querySelector('[data-testid="tier-marker-a1"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Jordan Smith: 22 in');
      expect(tooltip).not.toHaveTextContent(/range/i);
    });
  });

  it('shows a hover tooltip labeled "Team Average" on the primary marker when athleteValues is present', async () => {
    const user = userEvent.setup();
    render(
      <TierProgressChart
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 22 }]}
      />
    );
    const marker = document.querySelector('[data-testid="tier-marker-team-average"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Team Average: 25.5 in');
    });
  });

  it('shows a hover tooltip on the primary marker (individual-report usage) when athleteValues is absent', async () => {
    const user = userEvent.setup();
    render(<TierProgressChart label="Vertical Jump" metricCode="VJ" comparison={comparison} unit="in" />);
    const marker = document.querySelector('[data-testid="tier-marker-self"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('25.5 in');
    });
  });

  it('returns null (renders nothing) when there are no tiers, regardless of athleteValues', () => {
    const { container } = render(
      <TierProgressChart
        label="X"
        metricCode="X"
        comparison={{ ...comparison, allTiers: [] }}
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 22 }]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
