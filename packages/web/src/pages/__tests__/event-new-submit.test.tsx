/**
 * EventNew submit: the final metrics list is saved with ONE bulk request after the event is created.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import EventNew from '../event-new';

const mockNavigate = vi.fn();
const mockToast = vi.fn();
const mockCreateEvent = vi.fn();
const mockAddBulk = vi.fn();
const mockAddOne = vi.fn();
let mockFormData: any;

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', isSiteAdmin: false }, organizationContext: 'org-1', userOrganizations: [] }),
}));
vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useLocation: () => ['/events/new', mockNavigate],
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/lib/events-api', () => ({
  useCreateEvent: () => ({ mutateAsync: mockCreateEvent, isPending: false }),
  addEventMetricsBulk: (...args: unknown[]) => mockAddBulk(...args),
  addEventMetric: (...args: unknown[]) => mockAddOne(...args),
}));
// The wizard is covered by EventForm tests: here it just submits the data the test sets up
vi.mock('@/components/events', () => ({
  EventForm: ({ onSubmit, isSubmitting }: { onSubmit: (d: unknown, draft: boolean) => void; isSubmitting?: boolean }) => (
    <>
      <span data-testid="submitting">{String(!!isSubmitting)}</span>
      <button onClick={() => onSubmit(mockFormData, false)}>submit</button>
      <button onClick={() => onSubmit(mockFormData, true)}>submit draft</button>
    </>
  ),
}));

const baseForm = { name: 'Camp', eventType: 'camp', startDate: '2026-05-01', endDate: '', location: '', description: '' };
const metric = (code: string, extra: Record<string, unknown> = {}) => ({ code, label: `Label ${code}`, isRequired: false, ...extra });
const submit = async (name = 'submit') => userEvent.click(screen.getByRole('button', { name }));

describe('EventNew submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateEvent.mockResolvedValue({ id: 'ev-1' });
    mockAddBulk.mockResolvedValue({ added: [], alreadyPresent: [], skipped: [] });
    mockFormData = { ...baseForm, selectedMetrics: [] };
  });

  it('sends the final list in one bulk request, in list order, with required flags and labels', async () => {
    mockFormData = {
      ...baseForm,
      selectedMetrics: [metric('DASH_10YD', { isRequired: true, fromTemplate: true }), metric('JUMP_CMJ_HOH', { customLabel: 'CMJ', fromTemplate: true }), metric('T_TEST', { category: 'agility' })],
    };
    mockAddBulk.mockResolvedValue({ added: ['DASH_10YD', 'JUMP_CMJ_HOH', 'T_TEST'], alreadyPresent: [], skipped: [] });
    render(<EventNew />);
    await submit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/ev-1'));
    expect(mockAddBulk).toHaveBeenCalledTimes(1);
    expect(mockAddBulk).toHaveBeenCalledWith('ev-1', [
      { metricCode: 'DASH_10YD', isRequired: true, displayOrder: 0 },
      { metricCode: 'JUMP_CMJ_HOH', isRequired: false, displayOrder: 1, customLabel: 'CMJ' },
      { metricCode: 'T_TEST', isRequired: false, displayOrder: 2 },
    ]);
    expect(mockAddOne).not.toHaveBeenCalled();
    // The event is created without the form-only fields
    expect(mockCreateEvent.mock.calls[0][0]).not.toHaveProperty('selectedMetrics');
    expect(mockCreateEvent.mock.calls[0][0]).not.toHaveProperty('evalTemplate');
  });

  it('uses one bulk request for a hand-picked list too, never a per-metric loop', async () => {
    mockFormData = { ...baseForm, selectedMetrics: Array.from({ length: 23 }, (_, i) => metric(`M${i}`)) };
    mockAddBulk.mockResolvedValue({ added: mockFormData.selectedMetrics.map((m: any) => m.code), alreadyPresent: [], skipped: [] });
    render(<EventNew />);
    await submit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockAddBulk).toHaveBeenCalledTimes(1);
    expect(mockAddBulk.mock.calls[0][1]).toHaveLength(23);
    expect(mockAddOne).not.toHaveBeenCalled();
  });

  it('makes no metrics request when the list is empty', async () => {
    render(<EventNew />);
    await submit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/ev-1'));
    expect(mockAddBulk).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0]).toMatchObject({ title: 'Event Created', description: 'Your event has been published.' });
  });

  it('reports the number added in the single Event Created toast', async () => {
    mockFormData = { ...baseForm, selectedMetrics: [metric('A'), metric('B')] };
    mockAddBulk.mockResolvedValue({ added: ['A', 'B'], alreadyPresent: [], skipped: [] });
    render(<EventNew />);
    await submit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0]).toMatchObject({ title: 'Event Created', description: 'Your event has been created with 2 metrics.' });
  });

  it('names skipped tests plainly in the same toast, and does not count them as added', async () => {
    mockFormData = { ...baseForm, selectedMetrics: [metric('A'), metric('MOMENTUM', { label: 'Momentum' }), metric('GONE', { label: 'Old test' })] };
    mockAddBulk.mockResolvedValue({
      added: ['A'],
      alreadyPresent: [],
      skipped: [{ metricCode: 'MOMENTUM', reason: 'derived' }, { metricCode: 'GONE', reason: 'inactive' }],
    });
    render(<EventNew />);
    await submit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0].description).toBe('Your event has been created with 1 metric. Not added: Momentum (calculated automatically), Old test (not available).');
  });

  it('keeps the draft wording', async () => {
    mockFormData = { ...baseForm, selectedMetrics: [metric('A')] };
    mockAddBulk.mockResolvedValue({ added: ['A'], alreadyPresent: [], skipped: [] });
    render(<EventNew />);
    await submit('submit draft');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/ev-1'));
    expect(mockCreateEvent.mock.calls[0][0]).toMatchObject({ status: 'draft' });
    expect(mockToast.mock.calls[0][0]).toMatchObject({ title: 'Draft Saved', description: 'Your event has been saved as a draft.' });
  });

  it('still navigates to the created event, with one destructive toast, when the bulk request fails', async () => {
    mockFormData = { ...baseForm, selectedMetrics: [metric('A')] };
    mockAddBulk.mockRejectedValue(new Error('Event is frozen and cannot be modified'));
    render(<EventNew />);
    await submit();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/ev-1'));
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0]).toMatchObject({ variant: 'destructive', title: 'Event created, tests not added', description: 'Event is frozen and cannot be modified' });

    mockToast.mockClear();
    await submit('submit draft');
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockToast.mock.calls[0][0]).toMatchObject({ variant: 'destructive', title: 'Draft saved, tests not added' });
  });

  it('shows the error toast and does not navigate when the event itself cannot be created', async () => {
    mockCreateEvent.mockRejectedValue(new Error('Name is taken'));
    mockFormData = { ...baseForm, selectedMetrics: [metric('A')] };
    render(<EventNew />);
    await submit();
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockToast.mock.calls[0][0]).toMatchObject({ variant: 'destructive', title: 'Error', description: 'Name is taken' });
    expect(mockAddBulk).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores a second submit while the first is still running, and shows the form as submitting', async () => {
    let finish: (v: unknown) => void = () => {};
    mockCreateEvent.mockReturnValue(new Promise((res) => (finish = res)));
    render(<EventNew />);
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('submitting')).toHaveTextContent('true');
    finish({ id: 'ev-1' });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/ev-1'));
  });

  it('stays submitting through the metrics request too', async () => {
    mockFormData = { ...baseForm, selectedMetrics: [metric('A')] };
    let finish: (v: unknown) => void = () => {};
    mockAddBulk.mockReturnValue(new Promise((res) => (finish = res)));
    render(<EventNew />);
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mockAddBulk).toHaveBeenCalled());
    expect(screen.getByTestId('submitting')).toHaveTextContent('true');
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(mockCreateEvent).toHaveBeenCalledTimes(1);
    finish({ added: ['A'], alreadyPresent: [], skipped: [] });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  });

  it('can submit again after the event could not be created', async () => {
    mockCreateEvent.mockRejectedValueOnce(new Error('Name is taken'));
    render(<EventNew />);
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/ev-1'));
    expect(mockCreateEvent).toHaveBeenCalledTimes(2);
  });

  it('sends more than 100 tests as sequential batches of 100, keeping list order, and merges the results', async () => {
    const list = Array.from({ length: 230 }, (_, i) => metric(`M${i}`));
    mockFormData = { ...baseForm, selectedMetrics: list };
    mockAddBulk.mockImplementation(async (_id: string, batch: Array<{ metricCode: string }>) => ({
      added: batch.map((b) => b.metricCode).filter((c) => c !== 'M150'),
      alreadyPresent: [],
      skipped: batch.some((b) => b.metricCode === 'M150') ? [{ metricCode: 'M150', reason: 'derived' }] : [],
    }));
    render(<EventNew />);
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockAddBulk.mock.calls.map((c) => c[1].length)).toEqual([100, 100, 30]);
    expect(mockAddBulk.mock.calls[1][1][0]).toEqual({ metricCode: 'M100', isRequired: false, displayOrder: 100 });
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0].description).toBe('Your event has been created with 229 metrics. Not added: Label M150 (calculated automatically).');
  });

  it('stops at the first failing batch and says some tests were not added', async () => {
    mockFormData = { ...baseForm, selectedMetrics: Array.from({ length: 150 }, (_, i) => metric(`M${i}`)) };
    mockAddBulk.mockResolvedValueOnce({ added: Array.from({ length: 100 }, (_, i) => `M${i}`), alreadyPresent: [], skipped: [] }).mockRejectedValueOnce(new Error('Server busy'));
    render(<EventNew />);
    await userEvent.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/events/ev-1'));
    expect(mockAddBulk).toHaveBeenCalledTimes(2);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0]).toMatchObject({ variant: 'destructive', title: 'Event created, some tests not added' });
    expect(mockToast.mock.calls[0][0].description).toBe('100 tests were added. Server busy');
  });
});
