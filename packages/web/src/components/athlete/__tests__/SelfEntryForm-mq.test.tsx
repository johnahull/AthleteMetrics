/**
 * AM-FEAT-015 R2: athletes cannot enter Movement Quality scores (the API answers
 * 403), so the athlete self-entry form must not offer MQ pattern scores.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

const METRICS = [
  { code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's', metricType: 'lower_is_better', lowerIsBetter: true, isDerived: false },
  { code: 'MQ_JUMP', label: 'MQ Jump', unit: 'score', metricType: 'higher_is_better', lowerIsBetter: false, isDerived: false },
  { code: 'MQ_DECEL', label: 'MQ Decel', unit: 'score', metricType: 'higher_is_better', lowerIsBetter: false, isDerived: false },
];

vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({ metrics: METRICS, isLoading: false, error: null }),
}));

import { SelfEntryForm } from '../SelfEntryForm';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

describe('SelfEntryForm Movement Quality metrics', () => {
  it('does not offer MQ metrics to the athlete', async () => {
    const user = userEvent.setup();
    render(<SelfEntryForm onSubmit={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: /metric/i }));
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['10-Yard Fly (s)']);
  });
});
