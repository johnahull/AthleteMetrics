/** Segments of the radar outline: only between ADJACENT scored axes (cyclic), never across an unscored one. */
export function radarSegments(percentiles: ReadonlyArray<number | null>): Array<[number, number]> {
  const n = percentiles.length;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (n > 2 && percentiles[i] !== null && percentiles[j] !== null) out.push([i, j]);
  }
  return out;
}
