// packages/api/routes/pdf-chart-layout.ts

/**
 * Decide page breaks for charts flowed down PDF pages, packing as many as fit by
 * available vertical space — no fixed per-page count.
 *
 * Given each chart's block height (label + image + gap) and the usable height of a
 * page, returns, for each chart in order, whether a new page must start before it.
 * The first chart never triggers a break, so an oversized chart still renders on
 * its own page rather than being dropped.
 */
export function planChartPageBreaks(blockHeights: number[], usableHeight: number): boolean[] {
  const breaks: boolean[] = [];
  let used = 0; // height consumed on the current page

  blockHeights.forEach((height, i) => {
    if (i > 0 && used + height > usableHeight) {
      breaks.push(true); // overflow → this chart starts a new page
      used = height;
    } else {
      breaks.push(false);
      used += height;
    }
  });

  return breaks;
}
