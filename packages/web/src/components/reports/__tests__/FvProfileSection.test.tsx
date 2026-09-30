import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FvProfileSection } from '../FvProfileSection';
import type { ReportFvProfile } from '@shared/report-fv-types';

// ForceVelocityChart renders a react-chartjs-2 Scatter — mock to avoid canvas.
vi.mock('react-chartjs-2', () => ({
  Scatter: vi.fn(() => <div data-testid="mock-fv-scatter" />),
}));

const analysisJson: NonNullable<ReportFvProfile['analysisJson']> = {
  classification: {
    classification: 'force-deficit',
    imbalancePercent: 12,
    dominantQuality: 'velocity',
    trainingRecommendations: ['Heavy sled pushes', 'Resisted sprints'],
    explanation: 'Force production lags velocity capability.',
  },
  optimalGap: {
    optimalF0: 8.1,
    optimalV0: 9.2,
    optimalSlope: -0.88,
    f0Gap: -0.4,
    v0Gap: 0.3,
    f0GapPercent: -5.1,
    v0GapPercent: 3.4,
    estimatedTimeImprovement: 0.08,
    sprintDistanceM: 36.58,
    recommendation: 'Increase F0.',
  },
  accelerationProfile: {
    tau: 0.9, timeTo90Pct: 2.1, timeTo95Pct: 2.7, accelerationPhaseM: 18,
    tauRating: 'fast', trainingInsights: [],
  },
  powerProfile: {
    pmaxRel: 17.5, velocityAtPmax: 4.5, rfPeak: 0.42, rfPeakRating: 'good',
    drf: -0.08, drfRating: 'average', trainingInsights: [],
  },
};

const fvProfile: ReportFvProfile = {
  profileId: 'prof-1',
  date: '2026-01-15',
  distanceUnit: 'yards',
  f0Rel: '7.7000',
  v0: '9.1000',
  pmaxRel: '17.5000',
  fvSlope: '-0.846154',
  fitR2: '0.9987',
  analysisJson,
};

describe('FvProfileSection', () => {
  it('renders the section title, session date, KPIs, and chart', () => {
    render(<FvProfileSection athleteName="Jordan Doe" fvProfile={fvProfile} />);

    expect(screen.getByText('Sprint Force-Velocity Profile')).toBeInTheDocument();
    expect(screen.getByText(/Jan 15, 2026/)).toBeInTheDocument();

    // KPI tiles (metric units by default). F0/V0 labels and values also appear
    // in the analysis card's optimal-gap items, so allow multiple matches there.
    expect(screen.getAllByText('F0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7.70').length).toBeGreaterThan(0);   // f0Rel N/kg
    expect(screen.getAllByText('V0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('9.10').length).toBeGreaterThan(0);   // v0 m/s
    expect(screen.getByText('Pmax')).toBeInTheDocument();
    expect(screen.getByText('17.50')).toBeInTheDocument();  // pmaxRel W/kg
    expect(screen.getByText('F-V Slope')).toBeInTheDocument();
    expect(screen.getByText('-0.846')).toBeInTheDocument();
    expect(screen.getByText('Fit R²')).toBeInTheDocument();
    expect(screen.getByText('0.999')).toBeInTheDocument();

    expect(screen.getByTestId('mock-fv-scatter')).toBeInTheDocument();
  });

  it('renders the analysis narrative (classification + explanation + optimal gap recommendation)', () => {
    render(<FvProfileSection athleteName="Jordan Doe" fvProfile={fvProfile} />);

    expect(screen.getByText('Force Deficit')).toBeInTheDocument();
    expect(screen.getByText('Force production lags velocity capability.')).toBeInTheDocument();
    expect(screen.getByText('Heavy sled pushes')).toBeInTheDocument();
    // f0Gap < 0 && v0Gap > 0 → "Increasing F0 by ..." recommendation sentence
    expect(screen.getByText(/Increasing F0 by/)).toBeInTheDocument();
  });

  it('exposes PDF capture anchors for the chart and analysis blocks', () => {
    const { container } = render(<FvProfileSection athleteName="Jordan Doe" fvProfile={fvProfile} />);

    expect(container.querySelector('[data-report-chart="fvProfile"]')).not.toBeNull();
    expect(container.querySelector('[data-report-chart="fvProfile:analysis"]')).not.toBeNull();
  });

  it('omits the analysis block when analysisJson is null (old profiles)', () => {
    const { container } = render(
      <FvProfileSection athleteName="Jordan Doe" fvProfile={{ ...fvProfile, analysisJson: null }} />,
    );

    expect(screen.getByText('Sprint Force-Velocity Profile')).toBeInTheDocument();
    expect(screen.getByTestId('mock-fv-scatter')).toBeInTheDocument();
    expect(container.querySelector('[data-report-chart="fvProfile:analysis"]')).toBeNull();
    expect(screen.queryByText('Force Deficit')).not.toBeInTheDocument();
  });

  it('skips the chart but keeps the section when fit params are missing', () => {
    render(
      <FvProfileSection
        athleteName="Jordan Doe"
        fvProfile={{ ...fvProfile, f0Rel: null, v0: null, pmaxRel: null, fvSlope: null, fitR2: null }}
      />,
    );

    expect(screen.getByText('Sprint Force-Velocity Profile')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-fv-scatter')).not.toBeInTheDocument();
    // Missing KPI values render as an em dash placeholder
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
