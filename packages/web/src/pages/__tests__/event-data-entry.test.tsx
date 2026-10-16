/**
 * EventDataEntry page: numeric grid + Movement Quality panel (AM-FEAT-015)
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Measurement } from '@shared/schema';

const mutateSaveMq = vi.fn();
const mutateBulk = vi.fn();
const invalidateAfterMq = vi.fn();
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
const FROZEN_EVENT = { ...EVENT, isFrozen: true };
let eventState: typeof EVENT;
const downloadRecordingSheet = vi.fn();
/** Set to hold an uploaded file's reading until the test resolves it */
let readSheetGate: Promise<void> | null = null;
const readSheetCalls = vi.fn();

vi.mock('@/lib/recording-sheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/recording-sheet')>();
  return {
    ...actual,
    downloadRecordingSheet: (...args: unknown[]) => downloadRecordingSheet(...args),
    readSheetFile: async (file: File) => {
      readSheetCalls(file);
      if (readSheetGate) await readSheetGate;
      return actual.readSheetFile(file);
    },
  };
});
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
    useEvent: () => ({ data: eventState, isLoading: false }),
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
    useInvalidateAfterMovementQualitySave: () => invalidateAfterMq,
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
  invalidateAfterMq.mockReset();
  refetchMeasurements.mockReset();
  toast.mockReset();
  downloadRecordingSheet.mockReset();
  readSheetCalls.mockReset();
  readSheetGate = null;
  eventState = EVENT;
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
    const saveButton = () => screen.getByRole('button', { name: /^save( \(\d+\))?$/i });
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

    it('sends an m:ss cell of a time metric as seconds and shows it clean after the refetch', async () => {
      const user = userEvent.setup();
      eventMetricsState = [metric('MILE_RUN', { metricDetails: { label: 'Mile Run', unit: 's', category: 'endurance', displayFormat: 'duration' } })];
      measurementsState.data = [saved('m1', 'ath-1', 'MILE_RUN', 420)];
      mutateBulk.mockImplementation(async () => {
        measurementsState = { ...measurementsState, data: [saved('m1', 'ath-1', 'MILE_RUN', 402.5)] };
        return ok([], [{ ...saved('m1', 'ath-1', 'MILE_RUN', 402.5), index: 0 }]);
      });
      render(<EventDataEntry />);

      await user.clear(verticalJumpCell('Jordan Lee'));
      await user.type(verticalJumpCell('Jordan Lee'), '6:42.5');
      expect(verticalJumpCell('Jordan Lee')).not.toHaveAttribute('aria-invalid', 'true');
      await user.click(saveButton());

      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalled());
      expect(sentItems()).toEqual([
        { userId: 'ath-1', metric: 'MILE_RUN', value: 402.5, date: '2026-03-10T00:00:00.000Z', replaceMeasurementId: 'm1' },
      ]);
      expect(saveButton()).toBeDisabled();
    });

    it('shows a saved time cell as m:ss and labels the column (mm:ss)', async () => {
      const user = userEvent.setup();
      eventMetricsState = [metric('MILE_RUN', { metricDetails: { label: 'Mile Run', unit: 's', category: 'endurance', displayFormat: 'duration' } })];
      measurementsState.data = [saved('m1', 'ath-1', 'MILE_RUN', 402.5)];
      render(<EventDataEntry />);
      const header = screen.getByRole('columnheader', { name: /Mile Run/ });
      expect(header).toHaveTextContent('(mm:ss)');
      expect(header).not.toHaveTextContent('(s)');
      expect(verticalJumpCell('Jordan Lee')).toHaveValue('6:42.5');
      // Unchanged, so nothing to save
      expect(saveButton()).toBeDisabled();
      // Retyping the same time in seconds is still clean
      await user.clear(verticalJumpCell('Jordan Lee'));
      await user.type(verticalJumpCell('Jordan Lee'), '402.5');
      expect(saveButton()).toBeDisabled();
    });

    it('flags m:ss typed into a decimal metric as not a number', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      await user.type(verticalJumpCell('Jordan Lee'), '6:42');
      expect(verticalJumpCell('Jordan Lee')).toHaveAttribute('aria-invalid', 'true');
      expect(saveButton()).toBeDisabled();
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

  describe('add trial', () => {
    const saved = (id: string, userId: string, metricCode: string, value: number): Measurement =>
      ({ id, userId, metric: metricCode, value: String(value), notes: null, mediaUrl: null, isCalculated: false, calculatedFromMeasurementIds: null }) as any;
    const flyCell = (name: string) => screen.getByRole('textbox', { name: `10-Yard Fly for ${name}` });
    const addTrialButton = (value: string, name = 'Jordan Lee') =>
      screen.queryByRole('button', { name: `Save ${value} as a new 10-Yard Fly trial for ${name}` });
    const retype = async (user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value: string) => {
      await user.clear(input);
      await user.type(input, value);
    };

    beforeEach(() => {
      eventMetricsState = [metric('FLY10_TIME')];
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
    });

    it('sends exactly one item with no replaceMeasurementId, then shows the cell clean with 2 saved trials', async () => {
      const user = userEvent.setup();
      mutateBulk.mockImplementation(async () => {
        measurementsState = { ...measurementsState, data: [saved('m2', 'ath-1', 'FLY10_TIME', 1.6), ...measurementsState.data] };
        return { created: [{ ...saved('m2', 'ath-1', 'FLY10_TIME', 1.6), index: 0 }], replaced: [], errors: [] };
      });
      const { rerender } = render(<EventDataEntry />);
      await retype(user, flyCell('Jordan Lee'), '1.60');
      await user.click(addTrialButton('1.60')!);

      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      rerender(<EventDataEntry />);
      expect(mutateBulk).toHaveBeenCalledTimes(1);
      expect(mutateBulk.mock.calls[0][0]).toEqual({
        eventId: 'ev-1',
        measurements: [{ userId: 'ath-1', metric: 'FLY10_TIME', value: 1.6, date: '2026-03-10T00:00:00.000Z' }],
        invalidateMeasurements: false,
      });
      expect(await screen.findByText('2 saved trials')).toBeInTheDocument();
      expect(flyCell('Jordan Lee')).toHaveAttribute('data-state', 'saved');
      expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Trial saved', description: '10-Yard Fly for Jordan Lee (2 trials)' }));
      await waitFor(() => expect(flyCell('Jordan Lee')).toHaveFocus());
    });

    it('is not in the accessibility tree for an unchanged saved cell, a typed cell with no saved row, or a cell showing a sheet conflict', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      // Unchanged saved cell and an empty cell (Sam Park has no saved row)
      expect(screen.queryAllByRole('button', { name: /as a new 10-Yard Fly trial/ })).toHaveLength(0);
      await user.type(flyCell('Sam Park'), '1.7');
      expect(addTrialButton('1.7', 'Sam Park')).toBeNull();
      await user.clear(flyCell('Sam Park'));

      await upload(user, csvFile(['ath-1,Jordan Lee,1.70']));
      expect(flyCell('Jordan Lee')).toHaveAttribute('data-state', 'conflict');
      expect(screen.queryAllByRole('button', { name: /as a new 10-Yard Fly trial for Jordan Lee/ })).toHaveLength(0);
    });

    it('a lost response: the refetch shows the new row and the cell ends clean, so a retry cannot add a third row', async () => {
      const user = userEvent.setup();
      mutateBulk.mockImplementation(async () => {
        // The server saved the row ("1.6") but the response never arrived
        measurementsState = { ...measurementsState, data: [saved('m2', 'ath-1', 'FLY10_TIME', 1.6), ...measurementsState.data] };
        throw new Error('Failed to fetch');
      });
      refetchMeasurements.mockImplementation(async () => ({ data: measurementsState.data }));
      const { rerender } = render(<EventDataEntry />);
      await retype(user, flyCell('Jordan Lee'), '1.60');
      await user.click(addTrialButton('1.60')!);
      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      rerender(<EventDataEntry />);

      expect(await screen.findByText('2 saved trials')).toBeInTheDocument();
      // The server kept the trial, so no contradictory failure toast
      expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
      expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Trial saved' }));
      expect(flyCell('Jordan Lee')).toHaveAttribute('data-state', 'saved');
      expect(addTrialButton('1.60')).toBeNull();
      expect(screen.getByRole('button', { name: /^save( \(\d+\))?$/i })).toBeDisabled();
    });

    it('does not take focus back when the user moved on while the trial was saved', async () => {
      const user = userEvent.setup();
      eventMetricsState = [metric('FLY10_TIME'), metric('VERTICAL_JUMP', { displayOrder: 2 })];
      let finish!: (value: unknown) => void;
      mutateBulk.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      render(<EventDataEntry />);
      await retype(user, flyCell('Jordan Lee'), '1.60');
      await user.click(addTrialButton('1.60')!);
      const other = screen.getByRole('textbox', { name: 'Vertical Jump for Sam Park' });
      await user.click(other);
      finish({ created: [{ ...saved('m2', 'ath-1', 'FLY10_TIME', 1.6), index: 0 }], replaced: [], errors: [] });
      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      expect(other).toHaveFocus();
    });

    it('is not rendered on a frozen event', () => {
      eventState = FROZEN_EVENT;
      const { container } = render(<EventDataEntry />);
      expect(container.querySelector('[title="Save as a new trial"]')).toBeNull();
    });

    it('is not rendered for a paired-input or derived column', () => {
      eventMetricsState = [
        metric('FLY10_TIME', { metricDetails: { label: '10-Yard Fly', unit: 's', category: 'speed', auxiliaryInputConfig: { inputs: [] } } }),
        metric('MOMENTUM', { displayOrder: 2, metricDetails: { label: 'Momentum', unit: 'kg·m/s', category: 'speed', isDerived: true } }),
      ];
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65), saved('m3', 'ath-1', 'MOMENTUM', 400)];
      const { container } = render(<EventDataEntry />);
      expect(container.querySelector('[title="Save as a new trial"]')).toBeNull();
    });

    it('Save on a single-row cell still replaces that row', async () => {
      const user = userEvent.setup();
      mutateBulk.mockResolvedValue({ created: [], replaced: [{ ...saved('m1', 'ath-1', 'FLY10_TIME', 1.6), index: 0 }], errors: [] });
      render(<EventDataEntry />);
      await retype(user, flyCell('Jordan Lee'), '1.60');
      await user.click(screen.getByRole('button', { name: /^save( \(\d+\))?$/i }));
      await waitFor(() => expect(mutateBulk).toHaveBeenCalledTimes(1));
      expect(mutateBulk.mock.calls[0][0].measurements).toEqual([
        { userId: 'ath-1', metric: 'FLY10_TIME', value: 1.6, date: '2026-03-10T00:00:00.000Z', replaceMeasurementId: 'm1' },
      ]);
    });

    it('is disabled while Save is in flight', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65), saved('m2', 'ath-2', 'FLY10_TIME', 1.8)];
      let finish!: (value: unknown) => void;
      mutateBulk.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      render(<EventDataEntry />);
      await retype(user, flyCell('Jordan Lee'), '1.60');
      await retype(user, flyCell('Sam Park'), '1.75');
      await user.click(screen.getByRole('button', { name: /^save( \(\d+\))?$/i }));
      expect(addTrialButton('1.60')).toBeDisabled();
      finish({ created: [], replaced: [], errors: [] });
      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalled());
    });

    it('shows a per-item error on the cell, which stays dirty', async () => {
      const user = userEvent.setup();
      mutateBulk.mockResolvedValue({ created: [], replaced: [], errors: [{ index: 0, error: 'Not an event metric' }] });
      render(<EventDataEntry />);
      await retype(user, flyCell('Jordan Lee'), '1.60');
      await user.click(addTrialButton('1.60')!);
      expect(await screen.findByText('Not an event metric')).toBeInTheDocument();
      expect(flyCell('Jordan Lee')).toHaveAttribute('aria-invalid', 'true');
      expect(flyCell('Jordan Lee')).toHaveValue('1.60');
    });

    const csvFile = (lines: string[]) =>
      new File([['Event ID,ev-1', 'Athlete ID (do not edit),Athlete,10-Yard Fly (s) [FLY10_TIME]', ...lines].join('\n')], 'sheet.csv');
    const upload = async (user: ReturnType<typeof userEvent.setup>, file: File) => {
      await user.upload(screen.getByLabelText('Recording sheet file'), file);
      return screen.findByRole('region', { name: /^Sheet/ });
    };
  });

  describe('recording sheet', () => {
    const saved = (id: string, userId: string, metricCode: string, value: number): Measurement =>
      ({ id, userId, metric: metricCode, value: String(value), notes: null, mediaUrl: null, isCalculated: false, calculatedFromMeasurementIds: null }) as any;
    const HEADER = 'Athlete ID (do not edit),Athlete,Vertical Jump (in) [VERTICAL_JUMP],10-Yard Fly (s) [FLY10_TIME]';
    const csvFile = (lines: string[], eventId = 'ev-1') =>
      new File([['Event,Spring Screen', 'Date,2026-03-10', `Event ID,${eventId}`, HEADER, ...lines].join('\n')], 'sheet.csv', { type: 'text/csv' });
    const upload = async (user: ReturnType<typeof userEvent.setup>, file: File) => {
      await user.upload(screen.getByLabelText('Recording sheet file'), file);
      return screen.findByRole('region', { name: /^Sheet/ });
    };
    const cell = (name: string, label: string) => screen.getByRole('textbox', { name: `${label} for ${name}` });
    const saveButton = () => screen.getByRole('button', { name: /^save( \(\d+\))?$/i });

    beforeEach(() => {
      eventMetricsState = [
        metric('VERTICAL_JUMP'),
        metric('FLY10_TIME', { displayOrder: 2 }),
        metric('MOMENTUM', { displayOrder: 3, metricDetails: { label: 'Momentum', unit: 'kg·m/s', category: 'speed', isDerived: true } }),
      ];
    });

    it('downloads a CSV or Excel sheet of the grid athletes and typed metrics only', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      await user.click(screen.getByRole('button', { name: /download sheet/i }));
      await user.click(await screen.findByRole('menuitem', { name: /csv/i }));
      expect(downloadRecordingSheet).toHaveBeenCalledWith(
        {
          eventId: 'ev-1',
          eventName: 'Spring Screen',
          eventDate: '2026-03-10',
          metrics: [
            { code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' },
            { code: 'FLY10_TIME', label: '10-Yard Fly', unit: 's' },
          ],
          athletes: [
            { userId: 'ath-1', name: 'Jordan Lee' },
            { userId: 'ath-2', name: 'Sam Park' },
          ],
        },
        'csv',
      );
      await user.click(screen.getByRole('button', { name: /download sheet/i }));
      await user.click(await screen.findByRole('menuitem', { name: /excel/i }));
      expect(downloadRecordingSheet).toHaveBeenLastCalledWith(expect.anything(), 'xlsx');
      await user.click(screen.getByRole('button', { name: /download sheet/i }));
      await user.click(await screen.findByRole('menuitem', { name: /printable pdf/i }));
      expect(downloadRecordingSheet).toHaveBeenLastCalledWith(expect.anything(), 'pdf');
    });

    it('pre-prints saved values (the newest typed row) and trial counts, never an unsaved edit', async () => {
      const user = userEvent.setup();
      measurementsState.data = [
        saved('t2', 'ath-1', 'FLY10_TIME', 1.65),
        saved('t1', 'ath-1', 'FLY10_TIME', 1.7),
        saved('m3', 'ath-2', 'VERTICAL_JUMP', 30),
      ];
      render(<EventDataEntry />);
      await user.clear(cell('Sam Park', 'Vertical Jump'));
      await user.type(cell('Sam Park', 'Vertical Jump'), '31');
      await user.click(screen.getByRole('button', { name: /download sheet/i }));
      await user.click(await screen.findByRole('menuitem', { name: /csv/i }));
      expect(downloadRecordingSheet.mock.calls[0][0].athletes).toEqual([
        { userId: 'ath-1', name: 'Jordan Lee', values: { FLY10_TIME: '1.65' }, trials: { FLY10_TIME: 2 } },
        { userId: 'ath-2', name: 'Sam Park', values: { VERTICAL_JUMP: '30' }, trials: { VERTICAL_JUMP: 1 } },
      ]);
    });

    it('turns download and upload off when saved results could not be loaded', () => {
      measurementsState = { data: undefined as any, isError: true };
      render(<EventDataEntry />);
      expect(screen.getByRole('button', { name: /download sheet/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toHaveAccessibleDescription(
        'Saved results could not be loaded. Refresh before uploading a sheet.',
      );
    });

    it('disables download and upload for a frozen event and says why', () => {
      eventState = FROZEN_EVENT;
      render(<EventDataEntry />);
      expect(screen.getByRole('button', { name: /download sheet/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toHaveAccessibleDescription(/frozen/i);
    });

    it('blocks upload while the grid has unsaved edits', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      await user.type(cell('Jordan Lee', 'Vertical Jump'), '30');
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toHaveAccessibleDescription(/discard your unsaved changes/i);
    });

    it('tells you to resolve conflicts (not save) when only conflicts are pending', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,,1.70']));
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveAttribute('data-state', 'conflict');
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toHaveAccessibleDescription(/resolve all conflicts/i);
    });

    it('loads file values as unsaved cells, flags conflicts, lists rejected rows and moves focus to the summary', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile([
        'ath-1,Jordan Lee,30.5,1.70',
        'ath-2,Sam Park,,-',
        'ath-9,Pat Doe,29,',
        'ath-2,Sam Park,1,200,',
      ]));

      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveValue('30.5');
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveAttribute('data-state', 'imported');
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveValue('1.65');
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveAttribute('data-state', 'conflict');
      expect(screen.getByRole('button', { name: 'Conflict for 10-Yard Fly for Jordan Lee: saved 1.65, file 1.70' })).toBeInTheDocument();

      expect(summary).toHaveTextContent(/1 value loaded.*1 conflict/);
      const alert = summary;
      expect(alert).toHaveTextContent(/Row 7: Pat Doe is not on this event/);
      expect(alert).toHaveTextContent(/Row 6: Sam Park appears more than once \(rows 6, 8\)/);
      expect(alert).toHaveTextContent(/Row 8: Sam Park appears more than once/);
      expect(within(summary).getByRole('heading', { name: /sheet\.csv/ })).toHaveFocus();
      expect(saveButton()).toBeDisabled();
      expect(screen.getByText(/1 conflict to resolve/i)).toBeInTheDocument();
    });

    it('announces the result in live regions that stay mounted', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      render(<EventDataEntry />);
      const status = screen.getByTestId('recording-sheet-status');
      const alert = screen.getByTestId('recording-sheet-alert');
      expect(status).toHaveAttribute('role', 'status');
      expect(status).toHaveAttribute('aria-live', 'polite');
      expect(alert).toHaveAttribute('role', 'alert');

      await upload(user, csvFile(['ath-1,Jordan Lee,30.5,1.70', 'ath-9,Pat Doe,29,', 'ath-2,Sam Park,0,']));
      expect(screen.getByTestId('recording-sheet-status')).toBe(status);
      expect(status).toHaveTextContent('Sheet loaded: 1 value imported, 1 conflict, 1 row rejected');
      expect(alert).toHaveTextContent('Not loaded: 1 row, 1 invalid value. The list is in the sheet summary.');
    });

    it('announces a refused file in the alert region', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,30,'], 'ev-2'));
      expect(screen.getByTestId('recording-sheet-alert')).toHaveTextContent(/Sheet not loaded: This sheet is for a different event/);
    });

    it('refuses a sheet without an Event ID row', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      const summary = await upload(user, new File([`${HEADER}\nath-1,Jordan Lee,30,`], 'sheet.csv'));
      expect(summary).toHaveTextContent('This sheet has no Event ID row, so it cannot be checked against this event.');
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveValue('');
    });

    it('while a file is read: Upload and Save are off, and values typed meanwhile win over the file', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      let release!: () => void;
      readSheetGate = new Promise<void>((resolve) => (release = resolve));
      render(<EventDataEntry />);
      await user.upload(screen.getByLabelText('Recording sheet file'), csvFile(['ath-1,Jordan Lee,30.5,1.70', 'ath-2,Sam Park,28,']));
      await waitFor(() => expect(screen.getByRole('button', { name: /upload filled sheet/i })).toBeDisabled());
      expect(screen.getByLabelText('Recording sheet file')).toBeDisabled();
      expect(screen.getByTestId('recording-sheet-status')).toHaveTextContent('Reading sheet.csv');

      await user.type(cell('Jordan Lee', 'Vertical Jump'), '29');
      await user.clear(cell('Jordan Lee', '10-Yard Fly'));
      await user.type(cell('Jordan Lee', '10-Yard Fly'), '1.66');
      expect(saveButton()).toBeDisabled();
      // A second file cannot be chosen while the first is read
      await user.upload(screen.getByLabelText('Recording sheet file'), csvFile(['ath-2,Sam Park,27,']));
      expect(readSheetCalls).toHaveBeenCalledTimes(1);

      release();
      const summary = await screen.findByRole('region', { name: /^Sheet/ });
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveValue('29');
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveAttribute('data-state', 'dirty');
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveValue('1.66');
      expect(screen.queryByRole('button', { name: /^Conflict for 10-Yard Fly for Jordan Lee/ })).toBeNull();
      expect(cell('Sam Park', 'Vertical Jump')).toHaveValue('28');
      expect(summary).toHaveTextContent(/Jordan Lee, Vertical Jump: you typed a value while the file was read; the file value 30\.5 was not loaded/);
      expect(summary).toHaveTextContent(/Jordan Lee, 10-Yard Fly: you typed a value while the file was read; the file value 1\.70 was not loaded/);
      expect(screen.getByTestId('recording-sheet-status')).toHaveTextContent('Sheet loaded: 1 value imported, 0 conflicts, 0 rows rejected');
      expect(saveButton()).toBeEnabled();
    });

    it('a refetch landing while the file is read: a file value equal to the new saved value is unchanged, not a conflict', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      let release!: () => void;
      readSheetGate = new Promise<void>((resolve) => (release = resolve));
      const { rerender } = render(<EventDataEntry />);
      await user.upload(screen.getByLabelText('Recording sheet file'), csvFile(['ath-1,Jordan Lee,,1.70']));
      await waitFor(() => expect(screen.getByTestId('recording-sheet-status')).toHaveTextContent('Reading sheet.csv'));
      measurementsState = { ...measurementsState, data: [saved('m2', 'ath-1', 'FLY10_TIME', 1.7)] };
      rerender(<EventDataEntry />);
      release();
      await screen.findByRole('region', { name: /^Sheet/ });
      expect(screen.queryByRole('button', { name: /^Conflict for 10-Yard Fly for Jordan Lee/ })).toBeNull();
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveAttribute('data-state', 'saved');
    });

    it('the event query dropping out while the file is read does not break the import', async () => {
      const user = userEvent.setup();
      let release!: () => void;
      readSheetGate = new Promise<void>((resolve) => (release = resolve));
      const { rerender } = render(<EventDataEntry />);
      await user.upload(screen.getByLabelText('Recording sheet file'), csvFile(['ath-1,Jordan Lee,30,']));
      await waitFor(() => expect(screen.getByTestId('recording-sheet-status')).toHaveTextContent('Reading sheet.csv'));
      eventState = undefined as unknown as typeof EVENT;
      rerender(<EventDataEntry />);
      release();
      await waitFor(() => expect(readSheetCalls).toHaveBeenCalled());
      eventState = EVENT;
      rerender(<EventDataEntry />);
      const summary = await screen.findByRole('region', { name: /^Sheet/ });
      expect(summary).not.toHaveTextContent(/undefined/);
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveValue('30');
    });

    it('turns "Discard file values" off while a save is in flight', async () => {
      const user = userEvent.setup();
      let finish!: (value: unknown) => void;
      mutateBulk.mockReturnValue(new Promise((resolve) => (finish = resolve)));
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile(['ath-1,Jordan Lee,30,']));
      expect(within(summary).getByRole('button', { name: 'Discard file values' })).toBeEnabled();
      await user.click(saveButton());
      expect(within(summary).getByRole('button', { name: 'Discard file values' })).toBeDisabled();
      finish({ created: [], replaced: [], errors: [] });
      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalled());
    });

    it('shows an error toast when the sheet cannot be created', async () => {
      const user = userEvent.setup();
      downloadRecordingSheet.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
      render(<EventDataEntry />);
      await user.click(screen.getByRole('button', { name: /download sheet/i }));
      await user.click(await screen.findByRole('menuitem', { name: /excel/i }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Could not create the sheet' })),
      );
    });

    it('shows an error toast when the printable PDF cannot be created', async () => {
      const user = userEvent.setup();
      downloadRecordingSheet.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
      render(<EventDataEntry />);
      await user.click(screen.getByRole('button', { name: /download sheet/i }));
      await user.click(await screen.findByRole('menuitem', { name: /printable pdf/i }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', title: 'Could not create the sheet' })),
      );
    });

    it('rejects a sheet of another event and leaves the grid untouched', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile(['ath-1,Jordan Lee,30,'], 'ev-2'));
      expect(summary).toHaveTextContent(/different event/i);
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveValue('');
    });

    it('lists invalid values and ignored columns', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      const file = new File([`Event ID,ev-1\n${HEADER},Momentum [MOMENTUM]\nath-1,Jordan Lee,"1,5",DNF,500`], 'sheet.csv');
      const summary = await upload(user, file);
      expect(summary).toHaveTextContent(/Row 3, Jordan Lee, Vertical Jump: "1,5": Use a dot/);
      expect(summary).toHaveTextContent(/10-Yard Fly: "DNF"/);
      expect(summary).toHaveTextContent(/Column "Momentum \[MOMENTUM\]" was ignored: Momentum is calculated/);
    });

    it('"Use file value" replaces the single saved row; imported values are appended', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      mutateBulk.mockResolvedValue({ created: [], replaced: [], errors: [] });
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,30.5,1.70']));

      await user.click(screen.getByRole('button', { name: /^Conflict for 10-Yard Fly for Jordan Lee/ }));
      await user.click(await screen.findByRole('button', { name: 'Use file value' }));
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveValue('1.70');
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveFocus();
      expect(saveButton()).toBeEnabled();

      await user.click(saveButton());
      await waitFor(() => expect(mutateBulk).toHaveBeenCalledTimes(1));
      expect(mutateBulk.mock.calls[0][0].measurements).toEqual([
        { userId: 'ath-1', metric: 'VERTICAL_JUMP', value: 30.5, date: '2026-03-10T00:00:00.000Z' },
        { userId: 'ath-1', metric: 'FLY10_TIME', value: 1.7, date: '2026-03-10T00:00:00.000Z', replaceMeasurementId: 'm1' },
      ]);
    });

    it('"Use file value" on a cell with several trials adds a new trial', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('t2', 'ath-1', 'FLY10_TIME', 1.65), saved('t1', 'ath-1', 'FLY10_TIME', 1.7)];
      mutateBulk.mockResolvedValue({ created: [], replaced: [], errors: [] });
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile(['ath-1,Jordan Lee,,1.60']));
      await user.click(within(summary).getByRole('button', { name: 'Use all file values' }));
      await user.click(saveButton());
      await waitFor(() => expect(mutateBulk).toHaveBeenCalledTimes(1));
      expect(mutateBulk.mock.calls[0][0].measurements).toEqual([
        { userId: 'ath-1', metric: 'FLY10_TIME', value: 1.6, date: '2026-03-10T00:00:00.000Z' },
      ]);
    });

    it('"Keep all saved" resolves every conflict and leaves only imported values to save', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65), saved('m2', 'ath-2', 'FLY10_TIME', 1.8)];
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile(['ath-1,Jordan Lee,30,1.70', 'ath-2,Sam Park,,1.75']));
      expect(screen.getByText(/2 conflicts to resolve/i)).toBeInTheDocument();
      await user.click(within(summary).getByRole('button', { name: 'Keep all saved' }));
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveAttribute('data-state', 'saved');
      expect(cell('Sam Park', '10-Yard Fly')).toHaveValue('1.8');
      expect(screen.getByRole('button', { name: /save \(1\)/i })).toBeEnabled();
    });

    it('keeps a pending import when measurements are refetched', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      const { rerender } = render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,30,1.70']));
      measurementsState = { ...measurementsState, data: [...measurementsState.data] };
      rerender(<EventDataEntry />);
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveAttribute('data-state', 'imported');
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveAttribute('data-state', 'conflict');
    });

    it('"Discard file values" puts the grid back to its saved values', async () => {
      const user = userEvent.setup();
      measurementsState.data = [saved('m1', 'ath-1', 'FLY10_TIME', 1.65)];
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile(['ath-1,Jordan Lee,30,1.70']));
      await user.click(within(summary).getByRole('button', { name: 'Discard file values' }));
      expect(cell('Jordan Lee', 'Vertical Jump')).toHaveValue('');
      expect(cell('Jordan Lee', '10-Yard Fly')).toHaveAttribute('data-state', 'saved');
      expect(screen.queryByRole('region', { name: /^Sheet/ })).toBeNull();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toBeEnabled();
    });

    it('loads a filled XLSX sheet', async () => {
      const user = userEvent.setup();
      const { recordingSheetToXlsx } = await vi.importActual<typeof import('@/lib/recording-sheet')>('@/lib/recording-sheet');
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load((await recordingSheetToXlsx({
        eventId: 'ev-1', eventName: 'Spring Screen', eventDate: '2026-03-10',
        metrics: [{ code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in' }],
        athletes: [{ userId: 'ath-2', name: 'Sam Park' }],
      })) as unknown as ArrayBuffer);
      wb.worksheets[0].getCell('C5').value = 28.5;
      const file = new File([(await wb.xlsx.writeBuffer()) as ArrayBuffer], 'sheet.xlsx');
      render(<EventDataEntry />);
      await upload(user, file);
      expect(cell('Sam Park', 'Vertical Jump')).toHaveValue('28.5');
    });
  });

  describe('Movement Quality on the recording sheet', () => {
    const MQ_HEADER = 'Athlete ID (do not edit),Athlete,Vertical Jump (in) [VERTICAL_JUMP],Deceleration (0-3) [MQ_DECEL],Jump (0-3) [MQ_JUMP]';
    const csvFile = (lines: string[]) => new File([['Event ID,ev-1', MQ_HEADER, ...lines].join('\n')], 'sheet.csv');
    const upload = async (user: ReturnType<typeof userEvent.setup>, file: File) => {
      await user.upload(screen.getByLabelText('Recording sheet file'), file);
      return screen.findByRole('region', { name: /^Sheet/ });
    };
    const saveButton = () => screen.getByRole('button', { name: /^save( \(\d+\))?$/i });
    const mqButton = (name: string) => screen.getByRole('button', { name: `Movement Quality for ${name}` });
    const tooManyRequests = () => Object.assign(new Error('Too many requests, please try again later.'), { status: 429 });

    beforeEach(() => {
      registrationsState = [...REGISTRATIONS, { id: 'r3', userId: 'ath-3', status: 'checked_in', userFullName: 'Pat Doe' }];
    });

    it('downloads the 8 pattern columns after the grid metrics, with saved scores pre-printed', async () => {
      const user = userEvent.setup();
      measurementsState.data = [m('ath-1', 'MQ_DECEL', 0)];
      render(<EventDataEntry />);
      await user.click(screen.getByRole('button', { name: /download sheet/i }));
      await user.click(await screen.findByRole('menuitem', { name: /csv/i }));
      const sheet = downloadRecordingSheet.mock.calls[0][0];
      expect(sheet.metrics.map((c: { code: string }) => c.code)).toEqual(['VERTICAL_JUMP', ...PATTERNS]);
      expect(sheet.metrics[3]).toMatchObject({ code: 'MQ_DECEL', label: 'Deceleration', unit: '0-3' });
      expect(sheet.athletes[0]).toEqual({ userId: 'ath-1', name: 'Jordan Lee', values: { MQ_DECEL: '0' }, trials: {} });
    });

    it('shows sheet scores as pending in the Movement Quality column and a conflict blocks Save', async () => {
      const user = userEvent.setup();
      measurementsState.data = [m('ath-1', 'MQ_DECEL', 2)];
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,,3,2', 'ath-2,Sam Park,,1,0']));

      expect(screen.getByRole('button', { name: /^Movement Quality conflicts for Jordan Lee: 1 conflict, 1 score from sheet/ })).toBeInTheDocument();
      expect(mqButton('Sam Park')).toHaveAccessibleDescription('2 scores from sheet (unsaved)');
      // The saved summary stays the saved scores only
      expect(mqButton('Sam Park')).toHaveTextContent('Not scored');
      expect(screen.getByText(/1 conflict to resolve/i)).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toBeDisabled();
    });

    it('Use file value then Save sends one PUT per athlete with scores only, never through the bulk route', async () => {
      const user = userEvent.setup();
      measurementsState.data = [m('ath-1', 'MQ_DECEL', 2)];
      mutateSaveMq.mockResolvedValue({ saved: [], deleted: [] });
      mutateBulk.mockResolvedValue({ created: [{ ...m('ath-1', 'VERTICAL_JUMP', 30), id: 'n1', index: 0 }], replaced: [], errors: [] });
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,30,3,2', 'ath-2,Sam Park,,1,']));
      await user.click(screen.getByRole('button', { name: /^Movement Quality conflicts for Jordan Lee/ }));
      await user.click(await screen.findByRole('button', { name: 'Use file value for Deceleration' }));
      expect(saveButton()).toHaveTextContent('Save (4)');
      await user.click(saveButton());

      await waitFor(() => expect(mutateSaveMq).toHaveBeenCalledTimes(2));
      expect(mutateSaveMq.mock.calls.map((c) => c[0])).toEqual([
        { eventId: 'ev-1', userId: 'ath-1', upserts: [{ metric: 'MQ_DECEL', value: 3 }, { metric: 'MQ_JUMP', value: 2 }], deletes: [], invalidateMeasurements: false },
        { eventId: 'ev-1', userId: 'ath-2', upserts: [{ metric: 'MQ_DECEL', value: 1 }], deletes: [], invalidateMeasurements: false },
      ]);
      expect(mutateBulk).toHaveBeenCalledTimes(1);
      expect(mutateBulk.mock.calls[0][0].measurements.map((i: { metric: string }) => i.metric)).toEqual(['VERTICAL_JUMP']);
      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      expect(invalidateAfterMq).toHaveBeenCalledWith('ev-1');
      expect(toast).toHaveBeenLastCalledWith(
        expect.objectContaining({ title: 'Saved Successfully', description: 'Saved 1 measurements and Movement Quality for 2 athletes.' }),
      );
      expect(saveButton()).toBeDisabled();
    });

    it('a rate limit on the 2nd athlete stops the loop and keeps the rest unsaved', async () => {
      const user = userEvent.setup();
      mutateSaveMq.mockResolvedValueOnce({ saved: [], deleted: [] }).mockRejectedValueOnce(tooManyRequests());
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,,3,', 'ath-2,Sam Park,,1,', 'ath-3,Pat Doe,,2,']));
      await user.click(saveButton());

      await waitFor(() => expect(refetchMeasurements).toHaveBeenCalledTimes(1));
      expect(mutateSaveMq).toHaveBeenCalledTimes(2);
      expect(toast).toHaveBeenLastCalledWith(
        expect.objectContaining({
          variant: 'destructive',
          description: 'Saved MQ for 1 of 3 athletes. Too many requests, please try again later. Wait up to 15 minutes, then save again to send the rest.',
        }),
      );
      expect(mqButton('Sam Park')).toHaveAccessibleDescription('1 score from sheet (unsaved)');
      expect(mqButton('Pat Doe')).toHaveAccessibleDescription('1 score from sheet (unsaved)');
      expect(mqButton('Jordan Lee')).not.toHaveAttribute('aria-describedby');
      expect(saveButton()).toHaveTextContent('Save (2)');
    });

    it('per-score errors from the server stay on that athlete; the next athlete is still saved', async () => {
      const user = userEvent.setup();
      mutateSaveMq
        .mockRejectedValueOnce(new MovementQualitySaveError('1 score could not be saved', [{ metric: 'MQ_DECEL', error: 'Value must be at most 3' }]))
        .mockResolvedValueOnce({ saved: [], deleted: [] });
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,,3,', 'ath-2,Sam Park,,1,']));
      await user.click(saveButton());

      await waitFor(() => expect(mutateSaveMq).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('Deceleration: Value must be at most 3')).toBeInTheDocument();
      expect(mqButton('Jordan Lee')).toHaveAccessibleDescription('Deceleration: Value must be at most 3');
      await waitFor(() =>
        expect(toast).toHaveBeenLastCalledWith(
          expect.objectContaining({ title: 'Partial Save', description: 'Saved MQ for 1 of 2 athletes. 1 could not be saved; see the Movement Quality column.' }),
        ),
      );
    });

    it("blocks the panel's Save for an athlete with unsaved sheet scores", async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      await upload(user, csvFile(['ath-1,Jordan Lee,,3,']));
      await user.click(mqButton('Jordan Lee'));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent('This athlete has unsaved scores from a sheet. Save the page or discard the file values first.');
      expect(within(dialog).getByRole('button', { name: /save scores/i })).toBeDisabled();
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await user.click(mqButton('Sam Park'));
      expect(within(await screen.findByRole('dialog')).getByRole('button', { name: /save scores/i })).toBeEnabled();
    });

    it('after Close, scores the server refused can still be discarded per athlete, which unblocks the panel', async () => {
      const user = userEvent.setup();
      mutateSaveMq.mockRejectedValue(new MovementQualitySaveError('1 score could not be saved', [{ metric: 'MQ_DECEL', error: 'Value must be at most 2' }]));
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile(['ath-1,Jordan Lee,,3,']));
      await user.click(within(summary).getByRole('button', { name: 'Close' }));
      await user.click(saveButton());
      expect(await screen.findByText('Deceleration: Value must be at most 2')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Discard sheet scores for Jordan Lee' }));
      expect(screen.queryByText('Deceleration: Value must be at most 2')).toBeNull();
      expect(saveButton()).toBeDisabled();
      expect(screen.getByRole('button', { name: /upload filled sheet/i })).toBeEnabled();
      await user.click(mqButton('Jordan Lee'));
      expect(within(await screen.findByRole('dialog')).getByRole('button', { name: /save scores/i })).toBeEnabled();
    });

    it('"Discard file values" clears the pending Movement Quality scores', async () => {
      const user = userEvent.setup();
      measurementsState.data = [m('ath-2', 'MQ_DECEL', 2)];
      render(<EventDataEntry />);
      const summary = await upload(user, csvFile(['ath-1,Jordan Lee,,3,', 'ath-2,Sam Park,,1,']));
      await user.click(within(summary).getByRole('button', { name: 'Discard file values' }));
      expect(screen.queryByText(/from sheet \(unsaved\)/)).toBeNull();
      expect(screen.queryByRole('button', { name: /^Movement Quality conflicts/ })).toBeNull();
      expect(saveButton()).toBeDisabled();
    });

    it('an untouched pre-printed score is unchanged and an MQ total column is ignored with a warning', async () => {
      const user = userEvent.setup();
      eventMetricsState = [metric('VERTICAL_JUMP'), ...PATTERNS.map((c) => metric(c)), metric('MQI_TOTAL')];
      measurementsState.data = [m('ath-1', 'MQ_DECEL', 2)];
      render(<EventDataEntry />);
      const file = new File([['Event ID,ev-1', `${MQ_HEADER},MQI [MQI_TOTAL]`, 'ath-1,Jordan Lee,,2,,14'].join('\n')], 'sheet.csv');
      const summary = await upload(user, file);
      expect(summary).toHaveTextContent(/0 values loaded/);
      expect(summary).toHaveTextContent(/Column "MQI \[MQI_TOTAL\]" was ignored: Movement Quality Index \(MQI\) is calculated from the Movement Quality scores/);
      expect(saveButton()).toBeDisabled();
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
      expect(screen.queryByRole('button', { name: /scroll metrics/i })).toBeNull();
    });

    it('shows scroll buttons when the grid overflows: left is off at the start, right scrolls the grid', async () => {
      const user = userEvent.setup();
      stubWidth('scrollWidth', 1500);
      stubWidth('clientWidth', 400);
      const scrollBy = vi.fn();
      (Element.prototype as any).scrollBy = scrollBy;
      restore.push(() => delete (Element.prototype as any).scrollBy);
      render(<EventDataEntry />);
      const left = screen.getByRole('button', { name: 'Scroll metrics left' });
      const right = screen.getByRole('button', { name: 'Scroll metrics right' });
      expect(left).toBeDisabled();
      expect(right).toBeEnabled();
      expect(right).toHaveAttribute('aria-controls', 'event-data-entry-grid');
      expect(document.getElementById('event-data-entry-grid')).not.toBeNull();
      await user.click(right);
      expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: expect.any(Number) }));
      expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);
    });
  });

  describe('keyboard navigation', () => {
    beforeEach(() => {
      eventMetricsState = [metric('VERTICAL_JUMP'), metric('FLY10_TIME', { displayOrder: 2 })];
    });

    it('ArrowDown from Jordan Lee\'s 10-Yard Fly focuses Sam Park\'s 10-Yard Fly', async () => {
      const user = userEvent.setup();
      render(<EventDataEntry />);
      await user.click(screen.getByRole('textbox', { name: '10-Yard Fly for Jordan Lee' }));
      await user.keyboard('{ArrowDown}');
      expect(screen.getByRole('textbox', { name: '10-Yard Fly for Sam Park' })).toHaveFocus();
    });

    it('describes the keys on the inputs and in the card description', () => {
      render(<EventDataEntry />);
      expect(screen.getByRole('textbox', { name: 'Vertical Jump for Jordan Lee' })).toHaveAttribute(
        'aria-keyshortcuts',
        'ArrowUp ArrowDown ArrowLeft ArrowRight Enter',
      );
      expect(screen.getByText(/Arrow keys, Enter or Tab move between cells/)).toBeInTheDocument();
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
