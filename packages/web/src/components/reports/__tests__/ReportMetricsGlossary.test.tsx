import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportMetricsGlossary } from '../ReportMetricsGlossary';
import type { MetricExplanation } from '@shared/metric-explanations';

const FLY10: MetricExplanation = {
  title: '10-Yard Fly',
  shortDescription: 'Top-speed acceleration.',
  whatItMeasures: 'Measures velocity over a short zone.',
  whyItMatters: 'Reflects real-game speed.',
  unitNote: 'Measured in seconds; lower is better.',
  directionOfBetter: 'lower',
};

const VJ: MetricExplanation = {
  title: 'Vertical Jump',
  shortDescription: 'Lower-body explosive power.',
  whatItMeasures: 'Height from standing reach to max jump.',
  whyItMatters: 'Indicator of athletic potential.',
  unitNote: 'Measured in inches; higher is better.',
  directionOfBetter: 'higher',
};

describe('ReportMetricsGlossary', () => {
  it('renders one heading per unique metric code', () => {
    render(
      <ReportMetricsGlossary
        explanations={{ FLY10_TIME: FLY10, VERTICAL_JUMP: VJ }}
      />,
    );
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(2);
    expect(headings.map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['10-Yard Fly', 'Vertical Jump']),
    );
  });

  it("renders each metric's full explanation body", () => {
    render(
      <ReportMetricsGlossary explanations={{ FLY10_TIME: FLY10 }} />,
    );
    expect(screen.getByText(/velocity over a short zone/i)).toBeInTheDocument();
    expect(screen.getByText(/reflects real-game speed/i)).toBeInTheDocument();
    expect(screen.getByText(/lower is better/i)).toBeInTheDocument();
  });

  it('renders nothing when given an empty explanations map', () => {
    const { container } = render(<ReportMetricsGlossary explanations={{}} />);
    expect(container.querySelectorAll('h3')).toHaveLength(0);
  });

  it('uses a top-level section heading for screen reader navigation', () => {
    render(<ReportMetricsGlossary explanations={{ FLY10_TIME: FLY10 }} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/glossary/i);
  });
});
