import { CHART_CONFIG } from '@/constants/chart-config';
import type { ProcessedDateData } from './timeSeriesDataProcessor';

/**
 * Generates swarm plot datasets for individual athlete data points
 */
export function generateSwarmPlotDatasets(
  dateIndex: number,
  dateData: ProcessedDateData[],
  athleteColorMap: Map<string, string>,
  dateLabel: string,
  showAthleteNames: boolean = false
): any[] {
  const datasets: any[] = [];
  const xPos = dateIndex;

  // Sort by value for consistent positioning
  const sortedData = [...dateData].sort((a, b) => a.value - b.value);

  // Create swarm effect with slight x-axis jittering for overlapping values
  const processedPoints = new Map<number, number>(); // value -> count
  const swarmOffset = 0.15; // Maximum horizontal offset

  const swarmPoints = sortedData.map(point => {
    const count = processedPoints.get(point.value) || 0;
    processedPoints.set(point.value, count + 1);

    // Calculate x offset for swarm effect
    const offsetDirection = count % 2 === 0 ? 1 : -1;
    const offsetMagnitude = Math.ceil(count / 2) * 0.05;
    const xOffset = offsetDirection * Math.min(offsetMagnitude, swarmOffset);

    return {
      x: xPos + xOffset,
      y: point.value,
      athleteId: point.athleteId,
      athleteName: point.athleteName,
      isPersonalBest: point.isPersonalBest,
      color: athleteColorMap.get(point.athleteId) || CHART_CONFIG.COLORS.NEUTRAL
    };
  });

  // Group points by athlete for individual datasets
  const athletePointsMap = new Map<string, typeof swarmPoints>();
  swarmPoints.forEach(point => {
    if (!athletePointsMap.has(point.athleteId)) {
      athletePointsMap.set(point.athleteId, []);
    }
    athletePointsMap.get(point.athleteId)!.push(point);
  });

  // Create a dataset for each athlete
  athletePointsMap.forEach((points, athleteId) => {
    if (points.length === 0) return; // Safety check

    const athleteName = points[0].athleteName;
    const color = points[0].color;

    // Regular points
    const regularPoints = points.filter(p => !p.isPersonalBest);
    if (regularPoints.length > 0) {
      datasets.push({
        label: showAthleteNames ? `${athleteName} (${dateLabel})` : `${dateLabel} Data Points`,
        data: regularPoints,
        type: 'scatter',
        backgroundColor: color,
        borderColor: color,
        borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.THIN,
        pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.SMALL,
        showLine: false,
        order: 5
      });
    }

    // Personal best points (if any)
    const personalBestPoints = points.filter(p => p.isPersonalBest);
    if (personalBestPoints.length > 0) {
      datasets.push({
        label: showAthleteNames ? `${athleteName} PB (${dateLabel})` : `${dateLabel} Personal Bests`,
        data: personalBestPoints,
        type: 'scatter',
        backgroundColor: CHART_CONFIG.COLORS.PERSONAL_BEST,
        borderColor: CHART_CONFIG.COLORS.PERSONAL_BEST,
        borderWidth: CHART_CONFIG.STYLING.BORDER_WIDTH.DEFAULT,
        pointRadius: CHART_CONFIG.STYLING.POINT_RADIUS.PERSONAL_BEST,
        pointStyle: 'star',
        showLine: false,
        order: 0
      });
    }
  });

  return datasets;
}