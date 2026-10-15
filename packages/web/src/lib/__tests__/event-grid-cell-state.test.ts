import { describe, it, expect } from 'vitest';
import { canAddTrial, getCellState } from '../event-grid-cell-state';

describe('getCellState', () => {
  it.each([
    ['error wins over a conflict', { error: 'Must be a number', isDirty: true, importedValue: '4', originalValue: 3 }, 'error'],
    ['conflict wins over unsaved', { isDirty: false, importedValue: '4', originalValue: 3 }, 'conflict'],
    ['value from a file, not saved yet', { isDirty: true, fromImport: true }, 'imported'],
    ['file value saved (clean)', { isDirty: false, fromImport: true, originalValue: 4 }, 'saved'],
    ['typed edit', { isDirty: true, fromImport: false, originalValue: 3 }, 'dirty'],
    ['saved', { isDirty: false, originalValue: 3 }, 'saved'],
    ['empty', { isDirty: false }, 'empty'],
  ] as const)('%s', (_name, cell, expected) => {
    expect(getCellState(cell)).toBe(expected);
  });
});

describe('canAddTrial', () => {
  const base = { value: '1.70', isDirty: true, savedCount: 1 };
  it.each([
    ['a changed value on a cell with one saved row', base, true],
    ['a changed value on a cell with 3 saved rows', { ...base, savedCount: 3 }, true],
    ['no saved row yet (Save creates the first)', { ...base, savedCount: 0 }, false],
    ['an empty cell', { ...base, value: '' }, false],
    ['not dirty', { ...base, isDirty: false }, false],
    ['text that is not a number', { ...base, value: 'abc' }, false],
    ['a pending conflict', { ...base, importedValue: '1.80' }, false],
    ['a file value accepted with Use file value', { ...base, fromImport: true }, true],
  ] as const)('%s', (_name, cell, expected) => {
    expect(canAddTrial(cell)).toBe(expected);
  });
});
