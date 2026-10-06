/**
 * AM-FEAT-015 Phase 3: MovementQualityPanel (per-athlete MQI entry dialog)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
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
  render(
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
    />,
  );
  return { onSave, onOpenChange, user: userEvent.setup() };
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
    radio.focus();
    await user.keyboard(' ');
    expect(radio).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it('frozen event: inputs and Save are disabled with a notice', () => {
    setup({ disabled: true });
    expect(screen.getByText(/frozen/i)).toBeInTheDocument();
    expect(within(group('Jump')).getAllByRole('radio').every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });
});
