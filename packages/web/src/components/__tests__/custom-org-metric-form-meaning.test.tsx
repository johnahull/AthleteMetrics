import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CustomOrgMetricForm } from '../custom-metrics/CustomOrgMetricForm';

const update = vi.fn().mockResolvedValue({});
const create = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/sports-api', () => ({ useSports: () => ({ data: [] }) }));
vi.mock('@/lib/custom-metrics-api', () => ({
  useCreateCustomOrgMetric: () => ({ mutateAsync: create, isPending: false }),
  useUpdateCustomOrgMetric: () => ({ mutateAsync: update, isPending: false }),
}));
vi.mock('../custom-metrics/FormulaBuilder', () => ({ FormulaBuilder: () => null }));

const metric: any = {
  code: 'CUSTOM_A', label: 'Agility A', metricType: 'lower_is_better', decimalPrecision: 3, displayFormat: 'decimal',
  isDerived: false, meaning: 'How quickly he changes direction.', sportAssociations: [],
};

const openExplanations = () => fireEvent.mouseDown(screen.getByRole('tab', { name: 'Explanations' }), { button: 0 });
const meaningBox = () => screen.getByTestId('metric-meaning-input') as HTMLTextAreaElement;
const submit = () => fireEvent.click(screen.getByRole('button', { name: /update|save|create/i }));

beforeEach(() => { update.mockClear(); create.mockClear(); });

describe('CustomOrgMetricForm meaning field', () => {
  it('prefills on edit, shows help and a counter', () => {
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="o1" metric={metric} />);
    openExplanations();
    expect(meaningBox().value).toBe('How quickly he changes direction.');
    expect(screen.getByText(/Written for parents, no numbers, no medical claims \(33\/400\)/)).toBeInTheDocument();
  });

  it('clearing on edit sends null', async () => {
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="o1" metric={metric} />);
    openExplanations();
    fireEvent.change(meaningBox(), { target: { value: '' } });
    submit();
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0].data.meaning).toBeNull();
  });

  it('create sends undefined when left empty', async () => {
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="o1" metric={null} />);
    fireEvent.change(screen.getByPlaceholderText('e.g., 15m Sprint Time'), { target: { value: 'New metric' } });
    submit();
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0][0].data.meaning).toBeUndefined();
  });

  it('forbidden wording shows the message inline, on the Explanations tab, and does not save', async () => {
    render(<CustomOrgMetricForm open onClose={() => {}} organizationId="o1" metric={metric} />);
    openExplanations();
    fireEvent.change(meaningBox(), { target: { value: 'He is cleared to play.' } });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Basic Info' }), { button: 0 }); // submit from another tab
    submit();
    expect(await screen.findByText(/must not contain clearance/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
});
