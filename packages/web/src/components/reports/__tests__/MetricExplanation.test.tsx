import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MetricExplanation } from '../MetricExplanation';
import type { MetricExplanation as MetricExplanationData } from '@shared/metric-explanations';

const FLY10_EXPLANATION: MetricExplanationData = {
  title: '10-Yard Fly',
  shortDescription: 'How fast you hit and hold top speed once moving.',
  whatItMeasures: 'The 10-yard fly measures **maximum velocity** over a short zone.',
  whyItMatters: 'It reflects game-speed acceleration.',
  unitNote: 'Measured in seconds; lower is better.',
  directionOfBetter: 'lower',
};

describe('MetricExplanation', () => {
  it('renders the metric label', () => {
    render(
      <MetricExplanation label="10-Yard Fly Time" explanation={FLY10_EXPLANATION} />,
    );
    expect(screen.getByText('10-Yard Fly Time')).toBeInTheDocument();
  });

  it('is collapsed by default — detailed markdown is not visible', () => {
    render(
      <MetricExplanation label="10-Yard Fly Time" explanation={FLY10_EXPLANATION} />,
    );
    expect(screen.queryByText(/maximum velocity/i)).not.toBeInTheDocument();
  });

  it('expands on click to reveal whatItMeasures and whyItMatters', () => {
    render(
      <MetricExplanation label="10-Yard Fly Time" explanation={FLY10_EXPLANATION} />,
    );
    const trigger = screen.getByRole('button', { name: /explanation for 10-yard fly/i });
    fireEvent.click(trigger);
    expect(screen.getByText(/maximum velocity/i)).toBeInTheDocument();
    expect(screen.getByText(/game-speed acceleration/i)).toBeInTheDocument();
  });

  it('toggles aria-expanded on the trigger', () => {
    render(
      <MetricExplanation label="10-Yard Fly Time" explanation={FLY10_EXPLANATION} />,
    );
    const trigger = screen.getByRole('button', { name: /explanation for 10-yard fly/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders only the label when explanation is undefined (no trigger)', () => {
    render(<MetricExplanation label="Unknown Metric" explanation={undefined} />);
    expect(screen.getByText('Unknown Metric')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /explanation for/i })).not.toBeInTheDocument();
  });

  it('does not execute scripts embedded in custom markdown', () => {
    const malicious: MetricExplanationData = {
      ...FLY10_EXPLANATION,
      title: 'Custom Metric',
      whatItMeasures: 'Safe text <script>window.__pwned = true;</script> continues.',
    };
    const { container } = render(
      <MetricExplanation label="Custom Metric" explanation={malicious} />,
    );
    const trigger = screen.getByRole('button', { name: /explanation for custom metric/i });
    fireEvent.click(trigger);
    expect(container.querySelector('script')).toBeNull();
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
    expect(screen.getByText(/Safe text/)).toBeInTheDocument();
  });

  it('shows the unit note and short description when expanded', () => {
    render(
      <MetricExplanation label="10-Yard Fly Time" explanation={FLY10_EXPLANATION} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /explanation for 10-yard fly/i }));
    expect(screen.getByText(/measured in seconds; lower is better/i)).toBeInTheDocument();
  });

  it('strips javascript: URIs from markdown links', () => {
    const malicious: MetricExplanationData = {
      ...FLY10_EXPLANATION,
      title: 'Custom Metric',
      whatItMeasures: 'Read more at [trust me](javascript:alert(1)) now.',
    };
    const { container } = render(
      <MetricExplanation label="Custom Metric" explanation={malicious} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /explanation for custom metric/i }));
    const link = container.querySelector('a');
    if (link) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });

  it('generates unique DOM ids for multiple instances of the same metric on one page', () => {
    const { container } = render(
      <div>
        <MetricExplanation label="A" explanation={FLY10_EXPLANATION} />
        <MetricExplanation label="B" explanation={FLY10_EXPLANATION} />
      </div>,
    );
    const triggers = container.querySelectorAll('button[aria-controls]');
    const ids = Array.from(triggers).map((b) => b.getAttribute('aria-controls'));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
