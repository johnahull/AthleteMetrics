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

/**
 * Heading text for each chart that starts a metric group: the first chart of a group, or a group change from
 * the previous chart. A chart with no group (a section-level chart) gets no heading and resets the run, so a
 * following chart of the same group is headed again. No "(cont.)" headings.
 */
export function chartGroupHeadings(charts: Array<{ group?: string; groupLabel?: string }>): Array<string | null> {
  let previous: string | undefined;
  return charts.map(({ group, groupLabel }) => {
    const heading = group && group !== previous ? (groupLabel || group) : null;
    previous = group;
    return heading;
  });
}

/** Block heights with the heading height added where a heading is drawn, so it never strands from its chart. */
export function addHeadingHeights(blockHeights: number[], headings: Array<string | null>, headingHeight: number): number[] {
  return blockHeights.map((h, i) => (headings[i] ? h + headingHeight : h));
}
