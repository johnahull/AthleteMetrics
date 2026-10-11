import { describe, it, expect } from 'vitest';
import { chunkBulkItems, savedCellPatch, MAX_BULK_ITEMS, MAX_BULK_BYTES } from '../event-grid-save';

const item = (i: number, notes = '') => ({ userId: `u-${i}`, metric: 'VERTICAL_JUMP', value: i, date: '2026-03-10T00:00:00.000Z', notes });
const bytes = (chunk: unknown[]) => new TextEncoder().encode(JSON.stringify({ measurements: chunk })).length;

describe('chunkBulkItems', () => {
  it('splits 450 items into chunks of at most 200, in order', () => {
    const items = Array.from({ length: 450 }, (_, i) => item(i));
    const chunks = chunkBulkItems(items);
    expect(chunks.map((c) => c.length)).toEqual([200, 200, 50]);
    expect(chunks.flat()).toEqual(items);
  });

  it('splits further when items are large, keeping every request well under 100 kB', () => {
    const items = Array.from({ length: 150 }, (_, i) => item(i, 'x'.repeat(900)));
    const chunks = chunkBulkItems(items);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(items);
    chunks.forEach((c) => {
      expect(c.length).toBeLessThanOrEqual(MAX_BULK_ITEMS);
      expect(bytes(c)).toBeLessThanOrEqual(MAX_BULK_BYTES + 32);
    });
  });

  it('counts multi-byte characters as bytes, not string length', () => {
    const items = Array.from({ length: 40 }, (_, i) => item(i, '€'.repeat(500)));
    chunkBulkItems(items).forEach((c) => expect(bytes(c)).toBeLessThanOrEqual(MAX_BULK_BYTES + 32));
  });

  it('returns no chunks for no items', () => {
    expect(chunkBulkItems([])).toEqual([]);
  });
});

describe('savedCellPatch', () => {
  it('a replaced row keeps the trial count; the cell is clean with the new saved value', () => {
    expect(savedCellPatch({ value: '31', savedCount: 1 }, { value: '31' }, 'm1', true)).toEqual({
      originalValue: 31,
      savedMeasurementId: 'm1',
      savedCount: 1,
      isDirty: false,
      error: undefined,
    });
  });

  it('a created row adds a trial', () => {
    expect(savedCellPatch({ value: '32', savedCount: 1 }, { value: '32' }, 'm2', false)).toMatchObject({
      savedMeasurementId: 'm2',
      savedCount: 2,
      isDirty: false,
    });
  });

  it('a value retyped while the request was in flight stays dirty and keeps its error state', () => {
    const patch = savedCellPatch({ value: '32', savedCount: 1 }, { value: '33' }, 'm2', false);
    expect(patch).toMatchObject({ originalValue: 32, savedCount: 2, isDirty: true });
    expect(patch).not.toHaveProperty('error');
  });
});
