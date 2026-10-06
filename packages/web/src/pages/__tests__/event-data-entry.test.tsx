/**
 * EventDataEntry page: numeric grid + Movement Quality panel (AM-FEAT-015)
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Measurement } from '@shared/schema';

const mutateSaveMq = vi.fn();
const mutateBulk = vi.fn();
const refetchMeasurements = vi.fn();

let measurementsState: { data: Measurement[]; isError: boolean };
let eventMetricsState: any[];

vi.mock('wouter', () => ({
  useParams: () => ({ eventId: 'ev-1' }),
  useLocation: () => ['/events/ev-1/data-entry', vi.fn()],
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Stable references, like React Query returns between renders
const EVENT = { id: 'ev-1', name: 'Spring Screen', startDate: '2026-03-10T00:00:00.000Z', isFrozen: false };
const REGISTRATIONS = [
  { id: 'r1', userId: 'ath-1', status: 'checked_in', userFullName: 'Jordan Lee' },
  { id: 'r2', userId: 'ath-2', status: 'checked_in', userFullName: 'Sam Park' },
];

vi.mock('@/lib/events-api', async () => {
  class MovementQualitySaveError extends Error {
    constructor(message: string, public readonly errors: Array<{ metric: string; error: string }>) {
      super(message);
    }
  }
  return {
    MovementQualitySaveError,
    useEvent: () => ({ data: EVENT, isLoading: false }),
    useEventRegistrations: () => ({ data: REGISTRATIONS, isLoading: false, refetch: vi.fn() }),
    useEventMetrics: () => ({ data: eventMetricsState, isLoading: false }),
    useEventMeasurements: () => ({
      data: measurementsState.data,
      isError: measurementsState.isError,
      isLoading: false,
      refetch: refetchMeasurements,
    }),
    useCreateEventMeasurementsBulk: () => ({ mutateAsync: mutateBulk }),
    useSaveEventMovementQuality: () => ({ mutateAsync: mutateSaveMq }),
  };
});

import EventDataEntry from '../event-data-entry';
import { MovementQualitySaveError } from '@/lib/events-api';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const PATTERNS = ['MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP'];

const metric = (metricCode: string, extra: Record<string, unknown> = {}) => ({
  id: `em-${metricCode}`,
  eventId: 'ev-1',
  metricCode,
  displayOrder: 1,
  isRequired: false,
  label: metricCode,
  ...extra,
});

const m = (userId: string, metricCode: string, value: number): Measurement =>
  ({ id: `m-${userId}-${metricCode}`, userId, metric: metricCode, value: String(value), notes: null, mediaUrl: null }) as any;

const verticalJumpCell = (rowName: string) => {
  const row = screen.getByText(rowName).closest('tr')!;
  return within(row).getAllByRole('textbox')[0] as HTMLInputElement;
};

beforeEach(() => {
  mutateSaveMq.mockReset();
  mutateBulk.mockReset();
  refetchMeasurements.mockReset();
  measurementsState = { data: [], isError: false };
  eventMetricsState = [metric('VERTICAL_JUMP'), ...PATTERNS.map((c) => metric(c))];
});

describe('EventDataEntry', () => {
  it('keeps unsaved grid edits when Movement Quality scores are saved (measurements refetch)', async () => {
    const user = userEvent.setup();
    mutateSaveMq.mockImplementation(async () => {
      // the save refreshes the event measurements with the new MQ row
      measurementsState = { ...measurementsState, data: [m('ath-1', 'MQ_JUMP', 3)] };
      return { saved: [], deleted: [] };
    });
    const { rerender } = render(<EventDataEntry />);

    await user.type(verticalJumpCell('Jordan Lee'), '31');
    expect(screen.getByRole('button', { name: /save \(1\)/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Movement Quality for Sam Park' }));
    const dialog = await screen.findByRole('dialog');
    const jump = within(dialog).getByRole('group', { name: /^Jump score/ });
    await user.click(within(jump).getByRole('radio', { name: /^3\b/ }));
    await user.click(within(dialog).getByRole('button', { name: /save scores/i }));
    await waitFor(() => expect(mutateSaveMq).toHaveBeenCalledTimes(1));
    rerender(<EventDataEntry />);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(verticalJumpCell('Jordan Lee')).toHaveValue('31');
    expect(screen.getByRole('button', { name: /save \(1\)/i })).toBeInTheDocument();
  });

  it('saves one athlete with ONE atomic call (upserts + deletes)', async () => {
    const user = userEvent.setup();
    measurementsState.data = [m('ath-1', 'MQ_DECEL', 2)];
    mutateSaveMq.mockResolvedValue({ saved: [], deleted: [] });
    render(<EventDataEntry />);

    await user.click(screen.getByRole('button', { name: 'Movement Quality for Jordan Lee' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Clear Deceleration' }));
    const jump = within(dialog).getByRole('group', { name: /^Jump score/ });
    await user.click(within(jump).getByRole('radio', { name: /^1\b/ }));
    await user.click(within(dialog).getByRole('button', { name: /save scores/i }));

    await waitFor(() => expect(mutateSaveMq).toHaveBeenCalledTimes(1));
    expect(mutateSaveMq.mock.calls[0][0]).toEqual({
      eventId: 'ev-1',
      userId: 'ath-1',
      upserts: [{ metric: 'MQ_JUMP', value: 1, notes: '', mediaUrl: null }],
      deletes: ['m-ath-1-MQ_DECEL'],
    });
    expect(mutateBulk).not.toHaveBeenCalled();
  });

  it('shows per-metric errors from the server on the panel rows', async () => {
    const user = userEvent.setup();
    mutateSaveMq.mockRejectedValue(
      new MovementQualitySaveError('1 score could not be saved', [{ metric: 'MQ_JUMP', error: 'Value must be at most 3' }]),
    );
    render(<EventDataEntry />);
    await user.click(screen.getByRole('button', { name: 'Movement Quality for Jordan Lee' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(within(dialog).getByRole('group', { name: /^Jump score/ })).getByRole('radio', { name: /^2\b/ }));
    await user.click(within(dialog).getByRole('button', { name: /save scores/i }));
    expect(await within(dialog).findByText('Value must be at most 3')).toBeInTheDocument();
  });

  it('summarizes each athlete: total, partial count, or not scored', () => {
    measurementsState.data = [
      ...PATTERNS.map((c) => m('ath-1', c, 2)),
      m('ath-2', 'MQ_JUMP', 1),
    ];
    render(<EventDataEntry />);
    expect(screen.getByRole('button', { name: 'Movement Quality for Jordan Lee' })).toHaveTextContent('16 / 24');
    expect(screen.getByRole('button', { name: 'Movement Quality for Sam Park' })).toHaveTextContent('1 of 8 scored');
  });

  it('disables Movement Quality entry with an error when existing measurements failed to load', () => {
    measurementsState = { data: undefined as any, isError: true };
    render(<EventDataEntry />);
    expect(screen.getByRole('button', { name: 'Movement Quality for Jordan Lee' })).toBeDisabled();
    expect(screen.getByText(/could not load saved scores/i)).toBeInTheDocument();
  });

  it('counts required Movement Quality scores in the Required stat', () => {
    eventMetricsState = [metric('VERTICAL_JUMP'), ...PATTERNS.map((c) => metric(c, { isRequired: c === 'MQ_JUMP' }))];
    measurementsState.data = [m('ath-1', 'MQ_JUMP', 2)];
    render(<EventDataEntry />);
    const requiredCard = screen.getByText('Required').parentElement!;
    expect(requiredCard).toHaveTextContent('50%');
    expect(requiredCard).toHaveTextContent('(1/2)');
  });

  it('explains that MQI_TOTAL needs the pattern scores when only the total is enabled', () => {
    eventMetricsState = [metric('VERTICAL_JUMP'), metric('MQI_TOTAL')];
    render(<EventDataEntry />);
    expect(screen.getByText(/MQI total is calculated from the 8 Movement Quality pattern scores/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Movement Quality for/ })).toBeNull();
  });
});
