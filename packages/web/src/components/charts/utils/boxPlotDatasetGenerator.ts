import type { BoxPlotStatistics } from '../types/timeSeriesChartTypes';
import { TIME_SERIES_CHART_CONSTANTS, BOX_PLOT_COLORS } from '../constants/timeSeriesChartConstants';

const { BOX_WIDTH, CAP_WIDTH_RATIO } = TIME_SERIES_CHART_CONSTANTS;

/**
 * Generate all box plot datasets for a single date position
 * Extracted from main component for better maintainability
 */
export function generateBoxPlotDatasets(
  dateIndex: number,
  statistics: BoxPlotStatistics,
  dateLabel: string
): any[] {
  const datasets: any[] = [];
  const dateOffset = dateIndex; // Use numeric position
  const capWidth = BOX_WIDTH * CAP_WIDTH_RATIO;

  const { min, max, q1, median, q3, mean } = statistics;

  // 1. Box rectangle (Q1 to Q3) - drawn as rectangle outline
  datasets.push({
    label: `Box-${dateIndex}`,
    data: [
      { x: dateOffset - BOX_WIDTH/2, y: q1 },
      { x: dateOffset + BOX_WIDTH/2, y: q1 },
      { x: dateOffset + BOX_WIDTH/2, y: q3 },
      { x: dateOffset - BOX_WIDTH/2, y: q3 },
      { x: dateOffset - BOX_WIDTH/2, y: q1 }
    ],
    type: 'line',
    borderColor: BOX_PLOT_COLORS.BOX_BORDER,
    backgroundColor: BOX_PLOT_COLORS.BOX_BACKGROUND,
    borderWidth: 2,
    pointRadius: 0,
    showLine: true,
    fill: true,
    order: 2,
    tension: 0
  });

  // 2. Median line (horizontal line across box)
  datasets.push({
    label: `Median-${dateIndex}`,
    data: [
      { x: dateOffset - BOX_WIDTH/2, y: median },
      { x: dateOffset + BOX_WIDTH/2, y: median }
    ],
    type: 'line',
    borderColor: BOX_PLOT_COLORS.MEDIAN_LINE,
    backgroundColor: 'transparent',
    borderWidth: 3,
    pointRadius: 0,
    showLine: true,
    order: 1
  });

  // 3. Mean line (horizontal dashed line across box)
  datasets.push({
    label: `Mean-${dateIndex}`,
    data: [
      { x: dateOffset - BOX_WIDTH/2, y: mean },
      { x: dateOffset + BOX_WIDTH/2, y: mean }
    ],
    type: 'line',
    borderColor: BOX_PLOT_COLORS.MEAN_LINE,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderDash: [5, 5],
    pointRadius: 0,
    showLine: true,
    order: 1
  });

  // 4. Lower whisker (min to Q1)
  datasets.push({
    label: `LowerWhisker-${dateIndex}`,
    data: [
      { x: dateOffset, y: min },
      { x: dateOffset, y: q1 }
    ],
    type: 'line',
    borderColor: BOX_PLOT_COLORS.WHISKER,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    showLine: true,
    order: 2
  });

  // 5. Upper whisker (Q3 to max)
  datasets.push({
    label: `UpperWhisker-${dateIndex}`,
    data: [
      { x: dateOffset, y: q3 },
      { x: dateOffset, y: max }
    ],
    type: 'line',
    borderColor: BOX_PLOT_COLORS.WHISKER,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    showLine: true,
    order: 2
  });

  // 6. Whisker caps (horizontal lines at min and max)
  datasets.push({
    label: `MinCap-${dateIndex}`,
    data: [
      { x: dateOffset - capWidth/2, y: min },
      { x: dateOffset + capWidth/2, y: min }
    ],
    type: 'line',
    borderColor: BOX_PLOT_COLORS.CAPS,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    showLine: true,
    order: 2
  });

  datasets.push({
    label: `MaxCap-${dateIndex}`,
    data: [
      { x: dateOffset - capWidth/2, y: max },
      { x: dateOffset + capWidth/2, y: max }
    ],
    type: 'line',
    borderColor: BOX_PLOT_COLORS.CAPS,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    showLine: true,
    order: 2
  });

  return datasets;
}