import { parseDuration } from "@shared/duration-format";

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

/** The number in a grid cell: m:ss or seconds for a time (duration) metric, otherwise a plain number. Null when empty or invalid. */
export function cellNumber(cell: { value: string; isDuration?: boolean }): number | null {
  if (cell.isDuration) return parseDuration(cell.value);
  return cell.value !== "" && !isNaN(Number(cell.value)) ? Number(cell.value) : null;
}

/** A dirty cell with a number, also one the server rejected last time (its error is cleared on send) */
export const isSendable = (cell: { isDirty: boolean; value: string; isDuration?: boolean }) =>
  cell.isDirty && cellNumber(cell) !== null;

/**
 * Fields of a cell whose value `sent` was saved as row `savedId`: it replaced the cell's only row, or
 * was added as a new trial. A cell edited again while the request was in flight keeps its new value
 * and stays dirty.
 */
export function savedCellPatch(
  sent: { value: string; savedCount: number; isDuration?: boolean },
  current: { value: string },
  savedId: string,
  replaced: boolean,
): { originalValue: number; savedMeasurementId: string; savedCount: number; isDirty: boolean; error?: undefined } {
  return {
    originalValue: cellNumber(sent) ?? Number(sent.value),
    savedMeasurementId: savedId,
    savedCount: replaced ? sent.savedCount : sent.savedCount + 1,
    // Dirty against the value now saved, also when it was typed back to the old value meanwhile
    isDirty: current.value !== sent.value,
    ...(current.value === sent.value ? { error: undefined } : {}),
  };
}

const athletes = (n: number) => `${n} ${n === 1 ? "athlete" : "athletes"}`;
const sentence = (text: string) => `${text.trim().replace(/[.\s]+$/, "")}.`;

/** The toast after Save: the grid's measurements and the Movement Quality scores from a sheet, in one message */
export function saveSummary({
  grid,
  mq,
}: {
  grid: { total: number; saved: number; failed: number; failure?: string };
  /** Athletes with Movement Quality scores to save; notSent: skipped because the grid save failed */
  mq?: { athletes: number; saved: number; failed: number; stopped?: { message: string; rateLimited: boolean }; notSent?: boolean };
}): { title: string; description: string; variant?: "destructive" } {
  const problems: string[] = [];
  if (grid.failure || grid.failed > 0) {
    problems.push(
      `Saved ${grid.saved} of ${grid.total} measurements. ${grid.failure ? sentence(grid.failure) : `${grid.failed} could not be saved; see the highlighted cells.`}`,
    );
  }
  if (mq?.notSent) {
    problems.push("Movement Quality scores were not sent; save again to send them.");
  } else if (mq?.stopped) {
    const retry = mq.stopped.rateLimited ? "Wait up to 15 minutes, then save again to send the rest." : "Save again to send the rest.";
    problems.push(`Saved MQ for ${mq.saved} of ${athletes(mq.athletes)}. ${sentence(mq.stopped.message)} ${retry}`);
  } else if (mq && mq.failed > 0) {
    problems.push(`Saved MQ for ${mq.saved} of ${athletes(mq.athletes)}. ${mq.failed} could not be saved; see the Movement Quality column.`);
  } else if (mq && problems.length > 0) {
    problems.push(`Saved Movement Quality for ${athletes(mq.saved)}.`);
  }
  if (problems.length > 0) {
    return {
      variant: "destructive",
      title: grid.failure || mq?.stopped ? "Save Failed" : "Partial Save",
      description: problems.join(" "),
    };
  }
  return {
    title: "Saved Successfully",
    description: !mq
      ? `${grid.saved} measurements saved.`
      : grid.total > 0
        ? `Saved ${grid.saved} measurements and Movement Quality for ${athletes(mq.saved)}.`
        : `Saved Movement Quality for ${athletes(mq.saved)}.`,
  };
}
