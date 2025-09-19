import { CHART_CONFIG } from '@/constants/chart-config';
import type { BoxPlotStats } from './timeSeriesDataProcessor';

/**
 * Generates box plot datasets for a single date
 */
export function generateBoxPlotDatasets(
  dateIndex: number,
  stats: BoxPlotStats,
  dateLabel: string,
  boxWidth: number = CHART_CONFIG.BOX_PLOT.WHISKER_WIDTH
): any[] {
  const datasets: any[] = [];
  const xPos = dateIndex;

  // IQR box (interquartile range)
  datasets.push({
    label: `${dateLabel} IQR`,
    data: [
      { x: xPos - boxWidth/2, y: stats.q1 },
      { x: xPos + boxWidth/2, y: stats.q1 },
      { x: xPos + boxWidth/2, y: stats.q3 },
      { x: xPos - boxWidth/2, y: stats.q3 },
      { x: xPos - boxWidth/2, y: stats.q1 } // Close the box
    ],
    type: 'line',
    backgroundColor: CHART_CONFIG.COLORS.PRIMARY_LIGHT,
    borderColor: CHART_CONFIG.COLORS.PRIMARY_STRONG,
    borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
    pointRadius: 0,
    showLine: true,
    fill: true,
    order: 3
  });

  // Median line
  datasets.push({
    label: `${dateLabel} Median`,
    data: [
      { x: xPos - boxWidth/2, y: stats.median },
      { x: xPos + boxWidth/2, y: stats.median }
    ],
    type: 'line',
    backgroundColor: CHART_CONFIG.COLORS.PRIMARY,
    borderColor: CHART_CONFIG.COLORS.PRIMARY,
    borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
    pointRadius: 0,
    showLine: true,
    order: 2
  });

  // Whiskers
  const iqr = stats.q3 - stats.q1;
  const lowerWhisker = Math.max(stats.min, stats.q1 - 1.5 * iqr);
  const upperWhisker = Math.min(stats.max, stats.q3 + 1.5 * iqr);

  // Lower whisker
  datasets.push({
    label: `${dateLabel} Lower Whisker`,
    data: [
      { x: xPos, y: stats.q1 },
      { x: xPos, y: lowerWhisker }
    ],
    type: 'line',
    backgroundColor: CHART_CONFIG.COLORS.PRIMARY,
    borderColor: CHART_CONFIG.COLORS.PRIMARY,
    borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
    pointRadius: 0,
    showLine: true,
    order: 4
  });

  // Upper whisker
  datasets.push({
    label: `${dateLabel} Upper Whisker`,
    data: [
      { x: xPos, y: stats.q3 },
      { x: xPos, y: upperWhisker }
    ],
    type: 'line',
    backgroundColor: CHART_CONFIG.COLORS.PRIMARY,
    borderColor: CHART_CONFIG.COLORS.PRIMARY,
    borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
    pointRadius: 0,
    showLine: true,
    order: 4
  });

  // Mean point
  datasets.push({
    label: `${dateLabel} Mean`,
    data: [{ x: xPos, y: stats.mean }],
    type: 'scatter',
    backgroundColor: CHART_CONFIG.COLORS.AVERAGE,
    borderColor: CHART_CONFIG.COLORS.AVERAGE,
    borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THICK,
    pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.DEFAULT,
    pointStyle: 'crossRot',
    showLine: false,
    order: 1
  });

  return datasets;
}