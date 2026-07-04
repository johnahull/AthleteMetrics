import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { BenchmarkStandingBar } from '../BenchmarkStandingBar';
import type { BenchmarkComparison } from '@shared/benchmark-types';

const comparison: BenchmarkComparison = {
  benchmarkName: 'Club Standard',
  benchmarkValue: 26,
  athleteValue: 27.5,
  meetsOrExceeds: true,
  percentageDiff: 5.7,
  comparisonOperator: 'gte',
};

describe('BenchmarkStandingBar', () => {
  it('renders the base marker and caption with no athleteValues prop (individual-report usage, unaffected)', () => {
    render(<BenchmarkStandingBar label="Vertical Jump" metricCode="VJ" comparison={comparison} unit="in" />);
    expect(screen.getByText('Vertical Jump')).toBeInTheDocument();
    expect(screen.getByText(/You: 27.5 in/)).toBeInTheDocument();
    // Only one marker (the team-average/individual marker) — no per-athlete dots.
    expect(document.querySelectorAll('[data-testid^="benchmark-marker-"]').length).toBe(1);
    expect(document.querySelector('[data-testid="benchmark-marker-self"]')).toBeTruthy();
  });

  it('renders no legend cue when athleteValues is absent', () => {
    render(<BenchmarkStandingBar label="Vertical Jump" metricCode="VJ" comparison={comparison} unit="in" />);
    expect(screen.queryByText(/individual athlete/i)).not.toBeInTheDocument();
  });

  it('renders an additional marker per athlete when athleteValues is provided', () => {
    const athleteValues = [
      { athleteId: 'a1', athleteName: 'Jordan Smith', value: 24 },
      { athleteId: 'a2', athleteName: 'Alex Lee', value: 29 },
      { athleteId: 'a3', athleteName: 'Sam Rivera', value: 26 },
    ];
    render(
      <BenchmarkStandingBar
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={athleteValues}
      />
    );
    // 3 athlete dots + 1 team-average marker = 4 total.
    expect(document.querySelectorAll('[data-testid^="benchmark-marker-"]').length).toBe(4);
    expect(document.querySelector('[data-testid="benchmark-marker-team-average"]')).toBeTruthy();
    athleteValues.forEach((a) => {
      expect(document.querySelector(`[data-testid="benchmark-marker-${a.athleteId}"]`)).toBeTruthy();
    });
  });

  it('captions the value as "Team Average" (not "You") when athleteValues is present (regression: caption previously hardcoded "You" even for team-average data)', () => {
    render(
      <BenchmarkStandingBar
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 24 }]}
      />
    );
    expect(screen.getByText(/Team Average: 27.5 in/)).toBeInTheDocument();
    expect(screen.queryByText(/^You:/)).not.toBeInTheDocument();
  });

  it('shows a legend cue distinguishing team average vs individual athletes when athleteValues is present', () => {
    render(
      <BenchmarkStandingBar
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 24 }]}
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
      <BenchmarkStandingBar
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 24 }]}
        rangeLabel="Jan 1 – Jun 30, 2026"
      />
    );
    const marker = document.querySelector('[data-testid="benchmark-marker-a1"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      // Clarifies that each plotted athlete value is their best performance
      // within the report's timeframe (see TeamBenchmarkStandingSection).
      expect(screen.getByRole('tooltip')).toHaveTextContent('Jordan Smith: 24 in (best within Jan 1 – Jun 30, 2026)');
    });
  });

  it('omits the date-range parenthetical from the tooltip when no rangeLabel is supplied (regression: previously said "(best in range)" unconditionally, even with no range shown anywhere on the page)', async () => {
    const user = userEvent.setup();
    render(
      <BenchmarkStandingBar
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 24 }]}
      />
    );
    const marker = document.querySelector('[data-testid="benchmark-marker-a1"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toHaveTextContent('Jordan Smith: 24 in');
      expect(tooltip).not.toHaveTextContent(/range/i);
    });
  });

  it('shows a hover tooltip labeled "Team Average" on the primary marker when athleteValues is present', async () => {
    const user = userEvent.setup();
    render(
      <BenchmarkStandingBar
        label="Vertical Jump"
        metricCode="VJ"
        comparison={comparison}
        unit="in"
        athleteValues={[{ athleteId: 'a1', athleteName: 'Jordan Smith', value: 24 }]}
      />
    );
    const marker = document.querySelector('[data-testid="benchmark-marker-team-average"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Team Average: 27.5 in');
    });
  });

  it('shows a hover tooltip on the primary marker (individual-report usage) when athleteValues is absent', async () => {
    const user = userEvent.setup();
    render(<BenchmarkStandingBar label="Vertical Jump" metricCode="VJ" comparison={comparison} unit="in" />);
    const marker = document.querySelector('[data-testid="benchmark-marker-self"]') as HTMLElement;
    await user.hover(marker);
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('27.5 in');
    });
  });
});
