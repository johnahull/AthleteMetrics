/** POST /api/events/:id/measurements/bulk takes at most 200 items per request */
export const MAX_BULK_ITEMS = 200;
/** Express rejects JSON bodies over 100 kB with a 413: stay well under it */
export const MAX_BULK_BYTES = 50_000;

const encoder = new TextEncoder();

/**
 * Split bulk items into requests of at most maxItems items and about maxBytes of JSON each,
 * keeping their order. An item larger than maxBytes on its own still gets its own request.
 */
export function chunkBulkItems<T>(items: T[], maxItems = MAX_BULK_ITEMS, maxBytes = MAX_BULK_BYTES): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const item of items) {
    const size = encoder.encode(JSON.stringify(item)).length + 1; // + the comma
    if (current.length > 0 && (current.length >= maxItems || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Fields of a cell whose value `sent` was saved as row `savedId`: it replaced the cell's only row, or
 * was added as a new trial. A cell edited again while the request was in flight keeps its new value
 * and stays dirty.
 */
export function savedCellPatch(
  sent: { value: string; savedCount: number },
  current: { value: string },
  savedId: string,
  replaced: boolean,
): { originalValue: number; savedMeasurementId: string; savedCount: number; isDirty: boolean; error?: undefined } {
  return {
    originalValue: Number(sent.value),
    savedMeasurementId: savedId,
    savedCount: replaced ? sent.savedCount : sent.savedCount + 1,
    // Dirty against the value now saved, also when it was typed back to the old value meanwhile
    isDirty: current.value !== sent.value,
    ...(current.value === sent.value ? { error: undefined } : {}),
  };
}
