import { describe, it, expect } from 'vitest';
import { getCellState } from '../event-grid-cell-state';

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
