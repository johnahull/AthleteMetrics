import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadOnlyCoachingInsights } from '../ReadOnlyCoachingInsights';

describe('ReadOnlyCoachingInsights (athlete + public readers)', () => {
  it('shows the coach text, the title and the written date', () => {
    render(<ReadOnlyCoachingInsights insights={'Great week.\n\n- Keep landing soft'} generatedAt="2026-11-02T12:00:00Z" />);
    expect(screen.getByText('Coaching Insights')).toBeInTheDocument();
    expect(screen.getByText('Great week.')).toBeInTheDocument();
    expect(screen.getByText('Keep landing soft')).toBeInTheDocument();
    expect(screen.getByText(/Written:\s*Nov [123], 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Evaluation Written/)).toBeNull();
  });

  it('says "Unknown" is never shown: with no date it prints no date line', () => {
    render(<ReadOnlyCoachingInsights insights="Solid." generatedAt={null} />);
    expect(screen.queryByText(/Written/)).toBeNull();
    expect(screen.queryByText(/Unknown/)).toBeNull();
  });

  it('never implies a machine wrote it: no model badge, no icon, no AI wording', () => {
    const { container } = render(<ReadOnlyCoachingInsights insights="Solid." generatedAt="2026-11-02T12:00:00Z" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toMatch(/\bAI\b|claude|gemini|gpt|model/i);
  });

  it('drops images from the text', () => {
    const { container } = render(<ReadOnlyCoachingInsights insights={'Hi\n\n![x](https://evil.example/x.png)'} generatedAt={null} />);
    expect(container.querySelector('img')).toBeNull();
  });
});
