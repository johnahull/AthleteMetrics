import { describe, it, expect } from 'vitest';
import { chunkBulkItems, saveSummary, savedCellPatch, MAX_BULK_ITEMS, MAX_BULK_BYTES } from '../event-grid-save';

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

describe('saveSummary', () => {
  const grid = { total: 40, saved: 40, failed: 0 };

  it('grid only, as before', () => {
    expect(saveSummary({ grid })).toEqual({ title: 'Saved Successfully', description: '40 measurements saved.' });
  });

  it('counts both kinds in one message', () => {
    expect(saveSummary({ grid, mq: { athletes: 12, saved: 12, failed: 0 } }).description).toBe(
      'Saved 40 measurements and Movement Quality for 12 athletes.',
    );
    expect(saveSummary({ grid: { total: 0, saved: 0, failed: 0 }, mq: { athletes: 1, saved: 1, failed: 0 } }).description).toBe(
      'Saved Movement Quality for 1 athlete.',
    );
  });

  it('a stop says how many athletes were saved and to wait after a rate limit', () => {
    const result = saveSummary({ grid, mq: { athletes: 30, saved: 12, failed: 0, stopped: { message: 'Too many requests.', rateLimited: true } } });
    expect(result).toMatchObject({ variant: 'destructive', title: 'Save Failed' });
    expect(result.description).toBe('Saved MQ for 12 of 30 athletes. Too many requests. Wait up to 15 minutes, then save again to send the rest.');
    expect(
      saveSummary({ grid, mq: { athletes: 3, saved: 1, failed: 0, stopped: { message: 'Failed to fetch', rateLimited: false } } }).description,
    ).toBe('Saved MQ for 1 of 3 athletes. Failed to fetch. Save again to send the rest.');
  });

  it('refused athletes and a failed grid request', () => {
    expect(saveSummary({ grid, mq: { athletes: 3, saved: 2, failed: 1 } })).toMatchObject({
      title: 'Partial Save',
      description: 'Saved MQ for 2 of 3 athletes. 1 could not be saved; see the Movement Quality column.',
    });
    expect(
      saveSummary({ grid: { total: 450, saved: 200, failed: 0, failure: 'Network error' }, mq: { athletes: 2, saved: 0, failed: 0, notSent: true } }),
    ).toMatchObject({
      title: 'Save Failed',
      description: 'Saved 200 of 450 measurements. Network error. Movement Quality scores were not sent; save again to send them.',
    });
  });
});

