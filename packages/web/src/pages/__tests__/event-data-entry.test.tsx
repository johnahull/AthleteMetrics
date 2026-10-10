/**
 * EventDataEntry page: numeric grid + Movement Quality panel (AM-FEAT-015)
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Measurement } from '@shared/schema';

const mutateSaveMq = vi.fn();
const mutateBulk = vi.fn();
const refetchMeasurements = vi.fn();
const toast = vi.fn();

let measurementsState: { data: Measurement[]; isError: boolean };
let eventMetricsState: any[];
let registrationsState: any[];

vi.mock('wouter', () => ({
  useParams: () => ({ eventId: 'ev-1' }),
  useLocation: () => ['/events/ev-1/data-entry', vi.fn()],
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast }),
}));

const COACH_AUTH = {
  user: { id: 'coach-1', role: 'coach', isSiteAdmin: false },
  userOrganizations: [{ organizationId: 'org-1', role: 'coach' }],
};
let authState: any;

vi.mock('@/lib/auth', () => ({
  useAuth: () => authState,
}));

// Stable references, like React Query returns between renders
const EVENT = { id: 'ev-1', organizationId: 'org-1', name: 'Spring Screen', startDate: '2026-03-10T00:00:00.000Z', isFrozen: false };
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
    useEventRegistrations: () => ({ data: registrationsState, isLoading: false, refetch: vi.fn() }),
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
import { getCellState } from '@/lib/event-grid-cell-state';
import { MovementQualitySaveError } from '@/lib/events-api';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const PATTERNS = ['MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP'];

// Site metric details as the server attaches them (GET /api/events/:id/metrics?includeDetails=true)
const SITE_METRICS: Record<string, { label: string; unit: string | null; category: string | null }> = {
  VERTICAL_JUMP: { label: 'Vertical Jump', unit: 'in', category: 'power' },
  FLY10_TIME: { label: '10-Yard Fly', unit: 's', category: 'speed' },
  MQI_TOTAL: { label: 'Movement Quality Index (MQI)', unit: 'score', category: 'Movement Quality' },
};

const metric = (metricCode: string, extra: Record<string, unknown> = {}) => ({
  id: `em-${metricCode}`,
  eventId: 'ev-1',
  metricCode,
  displayOrder: 1,
  isRequired: false,
  customLabel: null,
  metricDetails: SITE_METRICS[metricCode] ?? { label: metricCode, unit: 'score', category: 'Movement Quality' },
  ...extra,
});

// Typed rows as GET /api/events/:id/measurements returns them (isCalculated + source ids included)
const m = (userId: string, metricCode: string, value: number): Measurement =>
  ({
    id: `m-${userId}-${metricCode}`, userId, metric: metricCode, value: String(value), notes: null, mediaUrl: null,
    isCalculated: false, calculatedFromMeasurementIds: null,
  }) as any;

const verticalJumpCell = (rowName: string) => {
  const row = screen.getByText(rowName).closest('tr')!;
  return within(row).getAllByRole('textbox')[0] as HTMLInputElement;
};

beforeEach(() => {
  mutateSaveMq.mockReset();
  mutateBulk.mockReset();
  refetchMeasurements.mockReset();
  toast.mockReset();
  measurementsState = { data: [], isError: false };
  registrationsState = REGISTRATIONS;
  authState = COACH_AUTH;
  eventMetricsState = [metric('VERTICAL_JUMP'), ...PATTERNS.map((c) => metric(c))];
});

describe('EventDataEntry', () => {
  // AM-FEAT-015 R1/R2: athletes cannot enter MQ scores or attach clips, so the
  // entry grid and Movement Quality panel are for event managers only.
  it('shows athletes no data entry or Movement Quality panel', () => {
    authState = {
      user: { id: 'ath-1', role: 'athlete', isSiteAdmin: false },
      userOrganizations: [{ organizationId: 'org-1', role: 'athlete' }],
    };
    render(<EventDataEntry />);
    expect(screen.getByText(/only coaches and organization admins can enter/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Movement Quality for/ })).toBeNull();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  // Auth and organization memberships load after the page: show the loading
  // skeleton until they are known instead of flashing Access Denied.
  it.each([
    ['no user yet', { user: null, userOrganizations: null }],
    ['organizations not loaded', { user: COACH_AUTH.user, userOrganizations: null }],
  ])('shows the loading skeleton while auth is not ready (%s)', (_case, auth) => {
    authState = auth;
    const { container } = render(<EventDataEntry />);
    expect(screen.queryByText(/access denied/i)).toBeNull();
    expect(screen.queryByText(/only coaches and organization admins can enter/i)).toBeNull();
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('shows an error with a retry instead of loading forever when organizations failed to load', async () => {
    const refetchOrganizations = vi.fn();
    authState = { user: COACH_AUTH.user, userOrganizations: null, organizationsError: true, refetchOrganizations };
    const { container } = render(<EventDataEntry />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(screen.getByText(/could not load your organizations/i)).toBeInTheDocument();
    expect(screen.queryByText(/access denied/i)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetchOrganizations).toHaveBeenCalledTimes(1);
  });

  it('does not wait for organizations for a site admin', () => {
    authState = { user: { id: 'admin-1', role: 'site_admin', isSiteAdmin: true }, userOrganizations: null };
    const { container } = render(<EventDataEntry />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Movement Quality for Sam Park' })).toBeInTheDocument();
  });

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

  describe('grid headers and labels', () => {
    // Regression: the page read flat label/units fields the server never sends, so every
    // header showed the raw code (VERTICAL_JUMP) and no unit.
    it('shows the readable site metric label and unit in the column header, not the code', () => {
      render(<EventDataEntry />);
      const header = screen.getByRole('columnheader', { name: /Vertical Jump/ });
      expect(header).toHaveTextContent('Vertical Jump');
      expect(header).toHaveTextContent('(in)');
      expect(within(header).queryByText('VERTICAL_JUMP')).toBeNull();
    });

    it('shows the metric code in a tooltip on the header label', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      await user.hover(within(screen.getByRole('columnheader', { name: /Vertical Jump/ })).getByText('Vertical Jump'));
      expect(await screen.findByRole('tooltip')).toHaveTextContent('VERTICAL_JUMP');
    });

    it('gives the header label a title with the full label and code (keyboard/touch/hover friendly)', () => {
      render(<EventDataEntry />);
      const header = screen.getByRole('columnheader', { name: /Vertical Jump/ });
      expect(within(header).getByText('Vertical Jump')).toHaveAttribute('title', 'Vertical Jump (VERTICAL_JUMP)');
    });

    it('prefers the event custom label and falls back to the code without site details', () => {
      eventMetricsState = [
        metric('VERTICAL_JUMP', { customLabel: 'CMJ no arms' }),
        metric('FLY10_TIME', { metricDetails: null, displayOrder: 2 }),
      ];
      render(<EventDataEntry />);
      expect(screen.getByRole('columnheader', { name: /CMJ no arms/ })).toHaveTextContent('(in)');
      expect(screen.getByRole('columnheader', { name: /FLY10_TIME/ })).not.toHaveTextContent('(');
    });

    it('marks the required star for screen readers', () => {
      eventMetricsState = [metric('VERTICAL_JUMP', { isRequired: true })];
      render(<EventDataEntry />);
      expect(screen.getByRole('columnheader', { name: /Vertical Jump.*\(required\)/ })).toBeInTheDocument();
    });

    it('keeps the required star outside the line-clamped label so long labels cannot clip it', () => {
      eventMetricsState = [metric('VERTICAL_JUMP', { isRequired: true, customLabel: 'A very long custom label that will certainly wrap past two lines' })];
      render(<EventDataEntry />);
      const header = screen.getByRole('columnheader', { name: /very long custom label/ });
      const clamped = header.querySelector('.line-clamp-3') as HTMLElement;
      const star = within(header).getByText('*');
      expect(clamped).toHaveTextContent('A very long custom label');
      expect(clamped.contains(star)).toBe(false);
    });

    it('uses column headers for metrics and a row header per athlete', () => {
      render(<EventDataEntry />);
      expect(screen.getByRole('columnheader', { name: 'Athlete' })).toHaveAttribute('scope', 'col');
      expect(screen.getByRole('columnheader', { name: /Movement Quality/ })).toHaveAttribute('scope', 'col');
      expect(screen.getByRole('columnheader', { name: /Vertical Jump/ })).toHaveAttribute('scope', 'col');
      const rowHeader = screen.getByRole('rowheader', { name: /Jordan Lee/ });
      expect(rowHeader).toHaveAttribute('scope', 'row');
    });

    it('pins the athlete column (sticky header and row header cells)', () => {
      render(<EventDataEntry />);
      expect(screen.getByRole('columnheader', { name: 'Athlete' })).toHaveClass('sticky', 'left-0');
      expect(screen.getByRole('rowheader', { name: /Sam Park/ })).toHaveClass('sticky', 'left-0');
    });

    it('names each input by metric and athlete, with required and invalid states', async () => {
      const user = userEvent.setup();
      eventMetricsState = [metric('VERTICAL_JUMP', { isRequired: true }), metric('FLY10_TIME', { displayOrder: 2 })];
      render(<EventDataEntry />);

      const vj = screen.getByRole('textbox', { name: 'Vertical Jump for Jordan Lee' });
      expect(vj).toHaveAttribute('aria-required', 'true');
      expect(vj).not.toHaveAttribute('aria-invalid');
      expect(screen.getByRole('textbox', { name: '10-Yard Fly for Sam Park' })).not.toHaveAttribute('aria-required');

      await user.type(vj, 'abc');
      expect(vj).toHaveAttribute('aria-invalid', 'true');
      expect(vj).toHaveAccessibleDescription('Must be a number');
    });
  });

  describe('grid save', () => {
    // GET /api/events/:id/measurements returns rows newest first (date, then createdAt)
    const saved = (id: string, userId: string, metricCode: string, value: number, extra: Record<string, unknown> = {}): Measurement =>
      ({
        id, userId, metric: metricCode, value: String(value), notes: null, mediaUrl: null,
        isCalculated: false, calculatedFromMeasurementIds: null, ...extra,
      }) as any;
    const sentItems = (call = 0) => mutateBulk.mock.calls[call][0].measurements;
    const saveButton = () => screen.getByRole('button', { name: /^save/i });
    const ok = (rows: Array<Record<string, unknown>>, replaced: Array<Record<string, unknown>> = [], errors: unknown[] = []) => ({
      created: rows,
      replaced,
      errors,
    });

    beforeEach(() => {
      eventMetricsState = [metric('VERTICAL_JUMP')];
    });

    it('shows the newest saved row of a cell, not the oldest', () => {
      measurementsState.data = [saved('new', 'ath-1', 'VERTICAL_JUMP', 31), saved('old', 'ath-1', 'VERTICAL_JUMP', 25)];
      render(<EventDataEntry />);
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('31');
    });

    it('ignores rows derived from other measurements', () => {
      measurementsState.data = [
        saved('derived', 'ath-1', 'VERTICAL_JUMP', 99, { isCalculated: true, calculatedFromMeasurementIds: ['a', 'b'] }),
        saved('typed', 'ath-1', 'VERTICAL_JUMP', 30),
      ];
      render(<EventDataEntry />);
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('30');
      expect(screen.queryByText(/saved trials/i)).toBeNull();
    });

    it('ignores a legacy derived row (isCalculated with no source list)', () => {
      measurementsState.data = [
        saved('legacy', 'ath-1', 'VERTICAL_JUMP', 99, { isCalculated: true, calculatedFromMeasurementIds: null }),
        saved('typed', 'ath-1', 'VERTICAL_JUMP', 30),
      ];
      render(<EventDataEntry />);
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('30');
      expect(screen.queryByText(/saved trials/i)).toBeNull();
    });

    it('keeps a paired-input row (isCalculated with an empty source list) as a typed value', () => {
      measurementsState.data = [
        saved('pair', 'ath-1', 'VERTICAL_JUMP', 33, { isCalculated: true, calculatedFromMeasurementIds: [] }),
        saved('typed', 'ath-1', 'VERTICAL_JUMP', 30),
      ];
      render(<EventDataEntry />);
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('33');
      expect(screen.getByText('2 saved trials')).toBeInTheDocument();
    });

    it('saves without a per-request measurements refetch; the page refetches once at the end', async () => {
      const user = userEvent.setup();
      mutateBulk.mockResolvedValue(ok([{ ...saved('n1', 'ath-1', 'VERTICAL_JUMP', 30), index: 0 }]));
      render(<EventDataEntry />);
      await user.type(verticalJumpCell('Jordan Lee'), '30');
      await user.click(saveButton());

      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      expect(mutateBulk.mock.calls[0][0]).toMatchObject({ eventId: 'ev-1', invalidateMeasurements: false });
    });

    it('a cell typed back to its old value while its save is in flight stays dirty and is saved next time', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'VERTICAL_JUMP', 10)];
      let resolve!: (value: unknown) => void;
      mutateBulk.mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
      render(<EventDataEntry />);

      await user.clear(verticalJumpCell('Jordan Lee'));
      await user.type(verticalJumpCell('Jordan Lee'), '12');
      await user.click(saveButton());
      await waitFor(() => expect(mutateBulk).toHaveBeenCalledTimes(1));

      await user.clear(verticalJumpCell('Jordan Lee'));
      await user.type(verticalJumpCell('Jordan Lee'), '10');
      measurementsState = { ...measurementsState, data: [saved('m1', 'ath-1', 'VERTICAL_JUMP', 12)] };
      resolve(ok([], [{ ...saved('m1', 'ath-1', 'VERTICAL_JUMP', 12), index: 0 }]));

      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(saveButton()).toBeEnabled());
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('10');
      expect(verticalJumpCell('Jordan Lee')).toHaveClass('bg-yellow-50');

      mutateBulk.mockResolvedValueOnce(ok([], [{ ...saved('m1', 'ath-1', 'VERTICAL_JUMP', 10), index: 0 }]));
      await user.click(saveButton());
      await waitFor(() => expect(mutateBulk).toHaveBeenCalledTimes(2));
      expect(sentItems(1)).toEqual([
        { userId: 'ath-1', metric: 'VERTICAL_JUMP', value: 10, date: '2026-03-10T00:00:00.000Z', replaceMeasurementId: 'm1' },
      ]);
    });

    it('re-sends a cell that failed on the server at the next Save without editing it', async () => {
      const user = userEvent.setup();
      mutateBulk.mockResolvedValueOnce(ok([], [], [{ index: 0, error: 'Server busy' }]));
      render(<EventDataEntry />);
      await user.type(verticalJumpCell('Jordan Lee'), '30');
      await user.click(saveButton());
      expect(await screen.findByText('Server busy')).toBeInTheDocument();

      mutateBulk.mockResolvedValueOnce(ok([{ ...saved('n1', 'ath-1', 'VERTICAL_JUMP', 30), index: 0 }]));
      await user.click(screen.getByRole('button', { name: /save \(1\)/i }));
      await waitFor(() => expect(mutateBulk).toHaveBeenCalledTimes(2));
      expect(sentItems(1)).toEqual([{ userId: 'ath-1', metric: 'VERTICAL_JUMP', value: 30, date: '2026-03-10T00:00:00.000Z' }]);
      await waitFor(() => expect(screen.queryByText('Server busy')).toBeNull());
      expect(verticalJumpCell('Jordan Lee')).toHaveClass('bg-green-50');
    });

    it('a retyped saved cell replaces that row, is clean after save + refetch, and a second Save sends nothing', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'VERTICAL_JUMP', 30)];
      mutateBulk.mockImplementation(async () => {
        measurementsState = { ...measurementsState, data: [saved('m1', 'ath-1', 'VERTICAL_JUMP', 31)] };
        return ok([], [{ ...saved('m1', 'ath-1', 'VERTICAL_JUMP', 31), index: 0 }]);
      });
      render(<EventDataEntry />);

      await user.clear(verticalJumpCell('Jordan Lee'));
      await user.type(verticalJumpCell('Jordan Lee'), '31');
      await user.click(saveButton());

      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalled());
      expect(sentItems()).toEqual([
        { userId: 'ath-1', metric: 'VERTICAL_JUMP', value: 31, date: '2026-03-10T00:00:00.000Z', replaceMeasurementId: 'm1' },
      ]);
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('31');
      expect(verticalJumpCell('Jordan Lee')).toHaveClass('bg-green-50');
      expect(saveButton()).toBeDisabled();
      await user.click(saveButton());
      expect(mutateBulk).toHaveBeenCalledTimes(1);
    });

    it('appends a retyped multi-trial cell as a new trial and shows the trial count', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('t2', 'ath-1', 'VERTICAL_JUMP', 30), saved('t1', 'ath-1', 'VERTICAL_JUMP', 28)];
      mutateBulk.mockImplementation(async () => {
        measurementsState = { ...measurementsState, data: [saved('t3', 'ath-1', 'VERTICAL_JUMP', 32), ...measurementsState.data] };
        return ok([{ ...saved('t3', 'ath-1', 'VERTICAL_JUMP', 32), index: 0 }]);
      });
      render(<EventDataEntry />);

      expect(screen.getByText('2 saved trials')).toBeInTheDocument();
      expect(verticalJumpCell('Jordan Lee')).toHaveAccessibleDescription('2 saved trials');

      await user.clear(verticalJumpCell('Jordan Lee'));
      await user.type(verticalJumpCell('Jordan Lee'), '32');
      await user.click(saveButton());

      await waitFor(() => expect(screen.getByText('3 saved trials')).toBeInTheDocument());
      expect(sentItems()[0]).not.toHaveProperty('replaceMeasurementId');
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('32');
      expect(saveButton()).toBeDisabled();
    });

    it('maps per-item errors back to their cells: failed cells keep their error, saved cells become clean', async () => {
      const user = userEvent.setup();
      mutateBulk.mockResolvedValue(
        ok([{ ...saved('n1', 'ath-1', 'VERTICAL_JUMP', 30), index: 0 }], [], [{ index: 1, error: 'Sam Park is not registered on this event' }]),
      );
      render(<EventDataEntry />);

      await user.type(verticalJumpCell('Jordan Lee'), '30');
      await user.type(verticalJumpCell('Sam Park'), '29');
      await user.click(saveButton());

      expect(await screen.findByText('Sam Park is not registered on this event')).toBeInTheDocument();
      expect(verticalJumpCell('Sam Park')).toHaveAttribute('aria-invalid', 'true');
      expect(verticalJumpCell('Sam Park')).toHaveValue('29');
      expect(verticalJumpCell('Jordan Lee')).toHaveClass('bg-green-50');
      expect(verticalJumpCell('Jordan Lee')).not.toHaveAttribute('aria-invalid');
      expect(toast).toHaveBeenLastCalledWith(
        expect.objectContaining({ variant: 'destructive', description: expect.stringMatching(/Saved 1 of 2/) }),
      );
    });

    describe('large sheets', () => {
      const METRICS = Array.from({ length: 10 }, (_, i) => `METRIC_${i}`);

      beforeEach(() => {
        eventMetricsState = METRICS.map((c, i) => metric(c, { displayOrder: i }));
        registrationsState = Array.from({ length: 45 }, (_, i) => ({ id: `r${i}`, userId: `u${i}`, status: 'checked_in', userFullName: `Athlete ${i}` }));
      });

      const fillAll = () => screen.getAllByRole('textbox').forEach((input, i) => fireEvent.change(input, { target: { value: String(i + 1) } }));
      const createdFor = (items: any[]) => ok(items.map((it, index) => ({ ...saved(`id-${it.userId}-${it.metric}`, it.userId, it.metric, it.value), index })));

      it('sends 450 dirty cells as 3 requests of at most 200 items', async () => {
        mutateBulk.mockImplementation(async ({ measurements }) => createdFor(measurements));
        render(<EventDataEntry />);
        fillAll();
        fireEvent.click(saveButton());

        await waitFor(() => expect(refetchMeasurements).toHaveBeenCalled());
        expect(mutateBulk.mock.calls.map((c) => c[0].measurements.length)).toEqual([200, 200, 50]);
        expect(saveButton()).toBeDisabled();
      }, 30_000);

      it('maps a per-item error in the second request to the first cell of that request', async () => {
        const replacedFor = (items: any[]) =>
          items.map((it, index) => ({ ...saved(`id-${it.userId}-${it.metric}`, it.userId, it.metric, it.value), index }));
        mutateBulk
          .mockImplementationOnce(async ({ measurements }) => createdFor(measurements))
          .mockImplementationOnce(async ({ measurements }) =>
            ok([], replacedFor(measurements).slice(1), [{ index: 0, error: 'Not an event metric' }]),
          )
          .mockImplementationOnce(async ({ measurements }) => createdFor(measurements));
        render(<EventDataEntry />);
        fillAll();
        fireEvent.click(saveButton());

        await waitFor(() => expect(refetchMeasurements).toHaveBeenCalled());
        const inputs = screen.getAllByRole('textbox');
        const flagged = inputs.filter((input) => input.getAttribute('aria-invalid') === 'true');
        expect(flagged).toEqual([inputs[200]]);
        expect(inputs[200]).toHaveAccessibleDescription('Not an event metric');
        expect(inputs[199]).toHaveClass('bg-green-50');
        expect(inputs[201]).toHaveClass('bg-green-50');
        expect(screen.getByRole('button', { name: /save \(1\)/i })).toBeEnabled();
      }, 30_000);

      it('stops at the first request that fails, keeps the rest dirty and says how many were saved', async () => {
        mutateBulk
          .mockImplementationOnce(async ({ measurements }) => createdFor(measurements))
          .mockRejectedValueOnce(new Error('Network error'));
        render(<EventDataEntry />);
        fillAll();
        fireEvent.click(saveButton());

        await waitFor(() => expect(refetchMeasurements).toHaveBeenCalled());
        expect(mutateBulk).toHaveBeenCalledTimes(2);
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({ variant: 'destructive', description: expect.stringMatching(/Saved 200 of 450.*Network error/) }),
        );
        expect(screen.getByRole('button', { name: /save \(250\)/i })).toBeEnabled();
      }, 30_000);
    });

    it('refetches saved measurements even when the save request fails', async () => {
      const user = userEvent.setup();
      mutateBulk.mockRejectedValue(new Error('Server error'));
      render(<EventDataEntry />);
      await user.type(verticalJumpCell('Jordan Lee'), '30');
      await user.click(saveButton());

      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      expect(verticalJumpCell('Jordan Lee')).toHaveClass('bg-yellow-50');
      expect(screen.getByRole('button', { name: /save \(1\)/i })).toBeEnabled();
    });

    it('lists approved, checked-in and completed athletes, not pending ones', () => {
      registrationsState = [
        { id: 'r1', userId: 'ath-1', status: 'completed', userFullName: 'Jordan Lee' },
        { id: 'r2', userId: 'ath-2', status: 'approved', userFullName: 'Sam Park' },
        { id: 'r3', userId: 'ath-3', status: 'pending', userFullName: 'Pat Doe' },
      ];
      render(<EventDataEntry />);
      expect(screen.getByRole('rowheader', { name: /Jordan Lee/ })).toHaveTextContent(/completed/i);
      expect(screen.getByRole('rowheader', { name: /Sam Park/ })).toBeInTheDocument();
      expect(screen.queryByText('Pat Doe')).toBeNull();
    });
  });

  describe('sideways scroll hint', () => {
    const restore: Array<() => void> = [];
    const stubWidth = (prop: 'scrollWidth' | 'clientWidth', value: number) => {
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
      restore.push(() => (original ? Object.defineProperty(HTMLElement.prototype, prop, original) : delete (HTMLElement.prototype as any)[prop]));
    };

    afterEach(() => {
      restore.splice(0).forEach((undo) => undo());
    });

    it('tells the user how many metric columns there are when the grid overflows', () => {
      stubWidth('scrollWidth', 1500);
      stubWidth('clientWidth', 400);
      render(<EventDataEntry />);
      // VERTICAL_JUMP + the Movement Quality column
      expect(screen.getByText(/2 metric columns/i)).toHaveTextContent(/scroll sideways/i);
    });

    it('says "1 metric column" in the singular', () => {
      stubWidth('scrollWidth', 1500);
      stubWidth('clientWidth', 400);
      eventMetricsState = [metric('FLY10_TIME')];
      render(<EventDataEntry />);
      expect(screen.getByText(/1 metric column\b(?!s)/)).toHaveTextContent(/scroll sideways/i);
    });

    it('shows no hint when every column fits', () => {
      stubWidth('scrollWidth', 400);
      stubWidth('clientWidth', 400);
      render(<EventDataEntry />);
      expect(screen.queryByText(/scroll sideways/i)).toBeNull();
    });
  });
});

describe('getCellState', () => {
  it.each([
    ['error wins over dirty', { error: 'Must be a number', isDirty: true, originalValue: 3 }, 'error'],
    ['unsaved edit', { isDirty: true, originalValue: 3 }, 'dirty'],
    ['new unsaved value', { isDirty: true }, 'dirty'],
    ['saved value', { isDirty: false, originalValue: 28.5 }, 'saved'],
    ['saved zero', { isDirty: false, originalValue: 0 }, 'saved'],
    ['empty', { isDirty: false }, 'empty'],
  ] as const)('%s', (_name, cell, expected) => {
    expect(getCellState(cell)).toBe(expected);
  });
});
