/**
 * EventDataEntry page: numeric grid + Movement Quality panel (AM-FEAT-015)
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
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
      const clamped = header.querySelector('.line-clamp-2') as HTMLElement;
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
