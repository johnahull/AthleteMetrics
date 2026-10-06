/**
 * AM-FEAT-015 Phase 3: MovementQualityPanel (per-athlete MQI entry dialog)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementQualityPanel } from '../MovementQualityPanel';
import { MQI_PATTERNS, MQI_TRANSITIONS } from '@shared/mqi-entry-schema';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const EVENT_DATE = '2026-03-10T10:00:00.000Z';
const allCodes = [...MQI_PATTERNS, ...MQI_TRANSITIONS].map((m) => m.code);

const saved = (metric: string, value: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${metric}`,
  userId: 'ath-1',
  metric,
  value: String(value),
  notes: null,
  mediaUrl: null,
  ...extra,
});

function setup(props: Partial<React.ComponentProps<typeof MovementQualityPanel>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  const element = (extra: Partial<React.ComponentProps<typeof MovementQualityPanel>> = {}) => (
    <MovementQualityPanel
      open
      onOpenChange={onOpenChange}
      athleteName="Jordan Lee"
      userId="ath-1"
      eventDate={EVENT_DATE}
      enabledMetricCodes={allCodes}
      measurements={[] as any}
      onSave={onSave}
      {...props}
      {...extra}
    />
  );
  const { rerender } = render(element());
  return {
    onSave,
    onOpenChange,
    user: userEvent.setup(),
    rerender: (extra: Partial<React.ComponentProps<typeof MovementQualityPanel>>) => rerender(element(extra)),
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const group = (label: string) => screen.getByRole('group', { name: new RegExp(`^${esc(label)} score`, 'i') });
const pick = async (user: ReturnType<typeof userEvent.setup>, label: string, score: number) => {
  await user.click(within(group(label)).getByRole('radio', { name: new RegExp(`^${score}\\b`) }));
};

describe('MovementQualityPanel', () => {
  it('renders 8 labelled pattern groups with a 0-3 picker and the rubric hint', () => {
    setup({ enabledMetricCodes: MQI_PATTERNS.map((p) => p.code) });
    for (const p of MQI_PATTERNS) {
      const g = group(p.label);
      expect(within(g).getAllByRole('radio')).toHaveLength(4);
    }
    expect(screen.queryByRole('group', { name: /Backpedal → Hip Turn/i })).toBeNull();
    for (const word of ['Efficient', 'Functional', 'Compensated', 'Absent']) {
      expect(screen.getAllByText(new RegExp(word)).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/Jordan Lee/)).toBeInTheDocument();
  });

  it('shows the 4 optional transition rows when a transition metric is enabled', () => {
    setup();
    for (const t of MQI_TRANSITIONS) expect(group(t.label)).toBeInTheDocument();
  });

  it('previews MQI total: incomplete until all 8 are set, 0 counts as set', async () => {
    const { user } = setup();
    const total = screen.getByTestId('mqi-total');
    expect(total).toHaveTextContent(/incomplete/i);
    for (const p of MQI_PATTERNS.slice(0, 7)) await pick(user, p.label, 3);
    expect(total).toHaveTextContent(/incomplete/i);
    expect(total).toHaveTextContent(/7 of 8/);
    await pick(user, MQI_PATTERNS[7].label, 0);
    expect(total).toHaveTextContent('21');
    expect(total).toHaveTextContent('/ 24');
  });

  it('previews the transition total only once transitions are scored; incomplete until 4 of 4', async () => {
    const { user } = setup();
    expect(screen.queryByTestId('mqi-transition-total')).toBeNull();
    await pick(user, MQI_TRANSITIONS[0].label, 2);
    expect(screen.getByTestId('mqi-transition-total')).toHaveTextContent(/incomplete/i);
    for (const t of MQI_TRANSITIONS.slice(1)) await pick(user, t.label, 3);
    expect(screen.getByTestId('mqi-transition-total')).toHaveTextContent('11');
  });

  it('prefills from existing event measurements (edit after the fact)', () => {
    setup({
      measurements: [
        saved('MQ_JUMP', 2, { notes: 'late left', mediaUrl: 'https://clips.example.com/j' }),
        saved('MQ_DECEL', 0),
      ] as any,
    });
    expect(within(group('Jump')).getByRole('radio', { name: /^2\b/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(group('Deceleration')).getByRole('radio', { name: /^0\b/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Jump clip link')).toHaveValue('https://clips.example.com/j');
    expect(screen.getByLabelText('Jump notes')).toHaveValue('late left');
  });

  it('saves only changed rows, with the event date', async () => {
    const { user, onSave } = setup({ measurements: [saved('MQ_JUMP', 2)] as any });
    await pick(user, 'Jump', 3);
    await pick(user, 'Max Velocity', 1);
    await user.type(screen.getByLabelText('Max Velocity notes'), 'right foot');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual({
      upserts: [
        { userId: 'ath-1', metric: 'MQ_MAX_VELO', value: 1, date: EVENT_DATE, notes: 'right foot', mediaUrl: null },
        { userId: 'ath-1', metric: 'MQ_JUMP', value: 3, date: EVENT_DATE, notes: '', mediaUrl: null },
      ],
      deletes: [],
    });
  });

  it('deselecting a saved score deletes it', async () => {
    const { user, onSave } = setup({ measurements: [saved('MQ_JUMP', 2)] as any });
    await pick(user, 'Jump', 2); // toggle off
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({ upserts: [], deletes: ['id-MQ_JUMP'] });
  });

  it('rejects a non-https clip link and does not save', async () => {
    const { user, onSave } = setup();
    await pick(user, 'Jump', 2);
    await user.type(screen.getByLabelText('Jump clip link'), 'http://clips.example.com/j');
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/public HTTPS URL/i)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is keyboard operable: focus a score and press Space', async () => {
    const { user, onSave } = setup();
    const radio = within(group('Hip Turn')).getByRole('radio', { name: /^3\b/ });
    act(() => radio.focus());
    await user.keyboard(' ');
    expect(radio).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].upserts).toEqual([
      expect.objectContaining({ metric: 'MQ_HIPTURN', value: 3 }),
    ]);
  });

  it('has an explicit per-row Clear that removes a saved score, clip and note', async () => {
    const { user, onSave } = setup({
      measurements: [saved('MQ_JUMP', 2, { notes: 'late left', mediaUrl: 'https://clips.example.com/j' })] as any,
    });
    expect(screen.getByRole('button', { name: 'Clear Deceleration' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Clear Jump' }));
    expect(within(group('Jump')).getByRole('radio', { name: /^2\b/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Jump notes')).toHaveValue('');
    expect(screen.getByLabelText('Jump clip link')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual({ upserts: [], deletes: ['id-MQ_JUMP'] });
  });

  it('labels clip and note inputs with <label> elements and links row errors to the inputs', async () => {
    const { user } = setup();
    const clip = screen.getByLabelText('Jump clip link');
    const notes = screen.getByLabelText('Jump notes');
    expect(document.querySelector(`label[for="${clip.id}"]`)).not.toBeNull();
    expect(document.querySelector(`label[for="${notes.id}"]`)).not.toBeNull();
    expect(group('Jump')).toHaveAttribute('aria-labelledby');

    await pick(user, 'Jump', 2);
    await user.type(clip, 'http://clips.example.com/j');
    await user.click(screen.getByRole('button', { name: /save/i }));
    const error = await screen.findByText(/public HTTPS URL/i);
    expect(error.id).toBeTruthy();
    expect(clip).toHaveAttribute('aria-invalid', 'true');
    expect(clip.getAttribute('aria-describedby')).toContain(error.id);
    expect(group('Jump').getAttribute('aria-describedby')).toContain(error.id);
  });

  it('shows per-metric errors returned by the server on the matching row', () => {
    setup({ serverErrors: { MQ_DECEL: 'Value must be at most 3' } });
    const error = screen.getByText('Value must be at most 3');
    expect(group('Deceleration').getAttribute('aria-describedby')).toContain(error.id);
  });

  it('keeps in-progress edits when the saved data refreshes while open; re-prefills on reopen', async () => {
    const { user, rerender } = setup({ measurements: [saved('MQ_JUMP', 1)] as any });
    await pick(user, 'Jump', 3);
    rerender({ measurements: [saved('MQ_JUMP', 1), saved('MQ_DECEL', 2)] as any });
    expect(within(group('Jump')).getByRole('radio', { name: /^3\b/ })).toHaveAttribute('aria-checked', 'true');

    rerender({ open: false, measurements: [saved('MQ_JUMP', 1), saved('MQ_DECEL', 2)] as any });
    rerender({ open: true, measurements: [saved('MQ_JUMP', 1), saved('MQ_DECEL', 2)] as any });
    expect(within(group('Jump')).getByRole('radio', { name: /^1\b/ })).toHaveAttribute('aria-checked', 'true');
    expect(within(group('Deceleration')).getByRole('radio', { name: /^2\b/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('frozen event: inputs and Save are disabled with a notice', () => {
    setup({ disabled: true });
    expect(screen.getByText(/frozen/i)).toBeInTheDocument();
    expect(within(group('Jump')).getAllByRole('radio').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
