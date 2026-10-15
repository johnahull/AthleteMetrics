import { useCallback, type KeyboardEvent } from "react";

/**
 * Arrow keys and Enter for a data-entry table, as one delegated onKeyDown on the <table>.
 * Targets carry data-grid-row / data-grid-col; anything else is ignored (buttons without them,
 * popover content whose key events bubble out of a portal). Up / Down / Enter (inputs only) move to
 * the same column of the previous / next row; Left / Right move on an input only when the caret is
 * collapsed at its start / end, and always on a button. Disabled targets are skipped; edges are no-ops.
 * IME composition and any modifier key are left to the browser, and Tab is untouched.
 */
export function useGridKeyboardNav() {
  return useCallback((e: KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    const { gridRow, gridCol } = target.dataset ?? {};
    if (gridRow === undefined || gridCol === undefined) return;

    const input = target instanceof HTMLInputElement ? target : null;
    const collapsed = !input || input.selectionStart === input.selectionEnd;
    let dRow = 0;
    let dCol = 0;
    switch (e.key) {
      case "ArrowUp":
        dRow = -1;
        break;
      case "ArrowDown":
        dRow = 1;
        break;
      case "Enter":
        if (!input) return; // Enter on a button must still click it
        dRow = 1;
        break;
      case "ArrowLeft":
        if (input && !(collapsed && input.selectionStart === 0)) return;
        dCol = -1;
        break;
      case "ArrowRight":
        if (input && !(collapsed && input.selectionStart === input.value.length)) return;
        dCol = 1;
        break;
      default:
        return;
    }
    e.preventDefault();

    const table = e.currentTarget;
    const targets = Array.from(table.querySelectorAll<HTMLElement>("[data-grid-row][data-grid-col]"));
    const at = new Map(targets.map((t) => [`${t.dataset.gridRow}:${t.dataset.gridCol}`, t]));
    const maxRow = Math.max(...targets.map((t) => Number(t.dataset.gridRow)));
    const maxCol = Math.max(...targets.map((t) => Number(t.dataset.gridCol)));
    let row = Number(gridRow) + dRow;
    let col = Number(gridCol) + dCol;
    while (row >= 0 && row <= maxRow && col >= 0 && col <= maxCol) {
      const next = at.get(`${row}:${col}`);
      if (next && !(next as HTMLInputElement | HTMLButtonElement).disabled) {
        next.focus();
        return;
      }
      row += dRow;
      col += dCol;
    }
  }, []);
}
