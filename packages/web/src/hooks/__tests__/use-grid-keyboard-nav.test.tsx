/**
 * useGridKeyboardNav: arrow keys and Enter move between the data-entry grid's cells.
 * Targets carry data-grid-row / data-grid-col; anything else (the add-trial button, popover
 * content portaled out of the table) is ignored.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { useGridKeyboardNav } from '../use-grid-keyboard-nav';

function Grid({ disabledCell }: { disabledCell?: string }) {
  const onKeyDown = useGridKeyboardNav();
  const rows = ['a', 'b', 'c'];
  return (
    <table onKeyDown={onKeyDown}>
      <tbody>
        {rows.map((r, row) => (
          <tr key={r}>
            {[0, 1].map((col) => (
              <td key={col}>
                <input
                  aria-label={`${r}${col}`}
                  defaultValue="1.5"
                  data-grid-row={row}
                  data-grid-col={col}
                  disabled={disabledCell === `${r}${col}`}
                />
              </td>
            ))}
            <td>
              <button type="button" aria-label={`mq ${r}`} data-grid-row={row} data-grid-col={2}>
                MQ
              </button>
              <button type="button" aria-label={`plain ${r}`}>
                +
              </button>
              {row === 0 && createPortal(<button type="button" aria-label="in popover">Keep saved</button>, document.body)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const el = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const press = (target: HTMLElement, key: string, init: Record<string, unknown> = {}) => {
  target.focus();
  return fireEvent.keyDown(target, { key, ...init });
};
const caret = (input: HTMLInputElement, start: number, end = start) => input.setSelectionRange(start, end);

describe('useGridKeyboardNav', () => {
  it('ArrowDown / ArrowUp / Enter move to the same column in the next or previous row', () => {
    render(<Grid />);
    press(el('a0'), 'ArrowDown');
    expect(el('b0')).toHaveFocus();
    press(el('b0'), 'Enter');
    expect(el('c0')).toHaveFocus();
    press(el('c0'), 'ArrowUp');
    expect(el('b0')).toHaveFocus();
  });

  it('prevents the default of a handled key', () => {
    render(<Grid />);
    expect(press(el('a0'), 'ArrowDown')).toBe(false);
  });

  it('is a no-op at the edges', () => {
    render(<Grid />);
    press(el('a0'), 'ArrowUp');
    expect(el('a0')).toHaveFocus();
    press(el('c1'), 'Enter');
    expect(el('c1')).toHaveFocus();
    const first = el('a0');
    first.focus();
    caret(first, 0);
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
  });

  it('ArrowLeft / ArrowRight move only when the caret is at the start / end', () => {
    render(<Grid />);
    const a0 = el('a0');
    a0.focus();
    caret(a0, 1);
    fireEvent.keyDown(a0, { key: 'ArrowRight' });
    expect(a0).toHaveFocus();
    caret(a0, 3);
    fireEvent.keyDown(a0, { key: 'ArrowRight' });
    expect(el('a1')).toHaveFocus();

    const a1 = el('a1');
    caret(a1, 2);
    fireEvent.keyDown(a1, { key: 'ArrowLeft' });
    expect(a1).toHaveFocus();
    caret(a1, 0);
    fireEvent.keyDown(a1, { key: 'ArrowLeft' });
    expect(a0).toHaveFocus();
  });

  it('does not move while text is selected', () => {
    render(<Grid />);
    const a0 = el('a0');
    a0.focus();
    caret(a0, 0, 3);
    fireEvent.keyDown(a0, { key: 'ArrowRight' });
    fireEvent.keyDown(a0, { key: 'ArrowLeft' });
    expect(a0).toHaveFocus();
  });

  it('does not move during IME composition or with a modifier held', () => {
    render(<Grid />);
    press(el('a0'), 'ArrowDown', { isComposing: true });
    expect(el('a0')).toHaveFocus();
    press(el('a0'), 'Enter', { keyCode: 229 });
    expect(el('a0')).toHaveFocus();
    for (const mod of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey']) {
      press(el('a0'), 'ArrowDown', { [mod]: true });
      expect(el('a0')).toHaveFocus();
    }
  });

  it('moves from the last input to the MQ button and back; arrows on the button always move', () => {
    render(<Grid />);
    const a1 = el('a1');
    a1.focus();
    caret(a1, 3);
    fireEvent.keyDown(a1, { key: 'ArrowRight' });
    expect(screen.getByLabelText('mq a')).toHaveFocus();
    press(screen.getByLabelText('mq a'), 'ArrowDown');
    expect(screen.getByLabelText('mq b')).toHaveFocus();
    press(screen.getByLabelText('mq b'), 'ArrowLeft');
    expect(el('b1')).toHaveFocus();
  });

  it('Enter on the MQ button does not move (it must still click)', () => {
    render(<Grid />);
    const result = press(screen.getByLabelText('mq a'), 'Enter');
    expect(screen.getByLabelText('mq a')).toHaveFocus();
    expect(result).toBe(true);
  });

  it('ignores keys on targets without grid attributes, including a portaled popover button', () => {
    render(<Grid />);
    expect(press(screen.getByLabelText('plain a'), 'ArrowDown')).toBe(true);
    expect(screen.getByLabelText('plain a')).toHaveFocus();
    expect(press(screen.getByLabelText('in popover'), 'ArrowDown')).toBe(true);
    expect(screen.getByLabelText('in popover')).toHaveFocus();
  });

  it('skips a disabled cell', () => {
    render(<Grid disabledCell="b0" />);
    press(el('a0'), 'ArrowDown');
    expect(el('c0')).toHaveFocus();
  });
});
