/**
 * MovementQualityGridCell: the Movement Quality column of the data-entry grid, with the scores
 * loaded from a recording sheet that are not saved yet (pending, conflicts, server errors).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementQualityGridCell } from '../MovementQualityGridCell';
import type { MqCell } from '@/lib/mq-sheet-cells';

beforeAll(() => {
  const proto = Element.prototype as any;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

const LABELS = new Map([
  ['MQ_DECEL', 'Deceleration'],
  ['MQ_JUMP', 'Jump'],
  ['MQ_SHUFFLE', 'Lateral Shuffle'],
  ['MQ_HIPTURN', 'Hip Turn'],
]);
const cell = (metricCode: string, extra: Partial<MqCell> = {}): MqCell => ({ userId: 'ath-1', metricCode, value: '', isDirty: false, ...extra });

function setup(cells: MqCell[]) {
  const onResolve = vi.fn();
  const onResolveAll = vi.fn();
  const onOpen = vi.fn();
  render(
    <MovementQualityGridCell
      userId="ath-1"
      athleteName="Jordan Lee"
      summary="1 of 8 scored"
      cells={cells}
      labels={LABELS}
      onOpen={onOpen}
      onResolve={onResolve}
      onResolveAll={onResolveAll}
    />,
  );
  return { onResolve, onResolveAll, onOpen, user: userEvent.setup() };
}

describe('MovementQualityGridCell', () => {
  it('shows only the saved summary when nothing is pending', () => {
    const { onOpen } = setup([cell('MQ_DECEL', { value: '2', originalValue: 2 })]);
    const button = screen.getByRole('button', { name: 'Movement Quality for Jordan Lee' });
    expect(button).toHaveTextContent('1 of 8 scored');
    expect(button).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText(/from sheet/)).toBeNull();
    button.click();
    expect(onOpen).toHaveBeenCalled();
  });

  it('counts unsaved scores from the sheet in sky blue', () => {
    setup([
      cell('MQ_DECEL', { value: '3', isDirty: true, fromImport: true }),
      cell('MQ_JUMP', { value: '0', isDirty: true, fromImport: true }),
      cell('MQ_SHUFFLE', { value: '1', isDirty: true, fromImport: true }),
    ]);
    const line = screen.getByText('3 scores from sheet (unsaved)');
    expect(line).toHaveClass('text-sky-700');
    expect(screen.getByRole('button', { name: 'Movement Quality for Jordan Lee' })).toHaveAccessibleDescription(
      '3 scores from sheet (unsaved)',
    );
  });

  it('lists conflicts in a popover, per pattern and for all of this athlete', async () => {
    const { user, onResolve, onResolveAll } = setup([
      cell('MQ_DECEL', { value: '2', originalValue: 2, importedValue: '3' }),
      cell('MQ_JUMP', { value: '1', originalValue: 1, importedValue: '0' }),
      cell('MQ_SHUFFLE', { value: '2', isDirty: true, fromImport: true }),
    ]);
    expect(screen.getByText('1 score from sheet (unsaved)')).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Movement Quality conflicts for Jordan Lee: 2 conflicts, 1 score from sheet (unsaved)' });
    expect(trigger).toHaveTextContent('2 conflicts');
    expect(trigger).toHaveClass('text-orange-700');

    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Deceleration: saved 2, file 3');
    expect(dialog).toHaveTextContent('Jump: saved 1, file 0');
    await user.click(within(dialog).getByRole('button', { name: 'Use file value for Deceleration' }));
    expect(onResolve).toHaveBeenCalledWith('MQ_DECEL', 'file');
    await user.click(within(dialog).getByRole('button', { name: 'Keep saved Jump' }));
    expect(onResolve).toHaveBeenCalledWith('MQ_JUMP', 'saved');
    await user.click(within(dialog).getByRole('button', { name: 'Use all file values for Jordan Lee' }));
    expect(onResolveAll).toHaveBeenCalledWith('file');
    // A choice for all moves focus back to the athlete's button, which closes the popover
    await user.click(trigger);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep all saved for Jordan Lee' }));
    expect(onResolveAll).toHaveBeenCalledWith('saved');
  });

  it('shows server errors per pattern in red and describes the button with them', () => {
    setup([
      cell('MQ_DECEL', { value: '3', isDirty: true, fromImport: true, error: 'Value must be at most 3' }),
      cell('MQ_HIPTURN', { value: '2', isDirty: true, fromImport: true, error: 'Value must be at most 3' }),
    ]);
    const error = screen.getByText('Deceleration: Value must be at most 3');
    expect(error.closest('[data-state="error"]')).toHaveClass('text-red-600');
    expect(screen.queryByText(/from sheet/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Movement Quality for Jordan Lee' })).toHaveAccessibleDescription(
      'Deceleration: Value must be at most 3 Hip Turn: Value must be at most 3',
    );
  });
});
