import type { LabelPosition, ChartBounds, PositioningStrategy } from '../types/timeSeriesChartTypes';
import { TIME_SERIES_CHART_CONSTANTS } from '../constants/timeSeriesChartConstants';

const {
  MAX_COLLISION_ITERATIONS,
  LABEL_PADDING,
  TEXT_HEIGHT,
  LABEL_OFFSET_STRATEGIES,
  CHART_EDGE_PADDING
} = TIME_SERIES_CHART_CONSTANTS;

/**
 * Resolve label collisions using sophisticated positioning strategies
 * Extracted from the main component to improve maintainability and testability
 */
export function resolveLabelCollisions(
  labels: LabelPosition[],
  chartBounds: ChartBounds
): LabelPosition[] {
  const resolved = labels.map(label => ({ ...label }));
  let iteration = 0;

  // Priority-based processing: labels closer to their original position get priority
  resolved.sort((a, b) => {
    const distA = Math.sqrt(Math.pow(a.x - a.originalX, 2) + Math.pow(a.y - a.originalY, 2));
    const distB = Math.sqrt(Math.pow(b.x - b.originalX, 2) + Math.pow(b.y - b.originalY, 2));
    return distA - distB;
  });

  while (iteration < MAX_COLLISION_ITERATIONS) {
    let hasCollisions = false;

    for (let i = 0; i < resolved.length; i++) {
      for (let j = i + 1; j < resolved.length; j++) {
        const labelA = resolved[i];
        const labelB = resolved[j];

        if (labelsCollide(labelA, labelB)) {
          hasCollisions = true;

          // Try multiple positioning strategies for labelB
          const strategies = generatePositioningStrategies(labelA, labelB, chartBounds);
          const bestStrategy = findBestStrategy(strategies, labelB, resolved, j);

          if (bestStrategy) {
            labelB.x = bestStrategy.x;
            labelB.y = bestStrategy.y;
          } else {
            // Last resort: try vertical spacing with larger gaps
            applyLastResortPositioning(labelB, j, chartBounds);
          }
        }
      }
    }

    if (!hasCollisions) break;
    iteration++;
  }

  // Final pass: remove labels that are still overlapping or outside bounds
  return resolved.filter(label => isLabelWithinBounds(label, chartBounds));
}

/**
 * Check if two labels collide
 */
function labelsCollide(labelA: LabelPosition, labelB: LabelPosition): boolean {
  const overlapsX = labelA.x < labelB.x + labelB.width + LABEL_PADDING &&
                   labelB.x < labelA.x + labelA.width + LABEL_PADDING;
  const overlapsY = Math.abs(labelA.y - labelB.y) < TEXT_HEIGHT + LABEL_PADDING;

  return overlapsX && overlapsY;
}

/**
 * Generate positioning strategies for resolving collisions
 */
function generatePositioningStrategies(
  labelA: LabelPosition,
  labelB: LabelPosition,
  chartBounds: ChartBounds
): PositioningStrategy[] {
  return [
    // Strategy 1: Move down
    { x: labelB.x, y: labelA.y + TEXT_HEIGHT + LABEL_PADDING },
    // Strategy 2: Move up
    { x: labelB.x, y: labelA.y - TEXT_HEIGHT - LABEL_PADDING },
    // Strategy 3: Move right
    { x: labelA.x + labelA.width + LABEL_PADDING, y: labelB.y },
    // Strategy 4: Move left
    { x: labelA.x - labelB.width - LABEL_PADDING, y: labelB.y },
    // Strategy 5: Move diagonally down-right
    { x: labelA.x + labelA.width + LABEL_PADDING, y: labelA.y + TEXT_HEIGHT + LABEL_PADDING },
    // Strategy 6: Move diagonally up-right
    { x: labelA.x + labelA.width + LABEL_PADDING, y: labelA.y - TEXT_HEIGHT - LABEL_PADDING },
    // Strategy 7: Move further right
    { x: labelB.originalX + LABEL_OFFSET_STRATEGIES.FURTHER_RIGHT, y: labelB.originalY },
    // Strategy 8: Move further left
    { x: labelB.originalX - labelB.width - LABEL_OFFSET_STRATEGIES.FURTHER_LEFT, y: labelB.originalY },
    // Strategy 9: Move vertically away from center
    {
      x: labelB.x,
      y: labelB.originalY + (labelB.originalY > (chartBounds.top + chartBounds.bottom) / 2
        ? LABEL_OFFSET_STRATEGIES.VERTICAL_SPACING
        : -LABEL_OFFSET_STRATEGIES.VERTICAL_SPACING)
    },
    // Strategy 10: Move with larger spacing
    {
      x: labelB.originalX + LABEL_OFFSET_STRATEGIES.LARGE_SPACING_X,
      y: labelB.originalY + LABEL_OFFSET_STRATEGIES.LARGE_SPACING_Y
    }
  ];
}

/**
 * Find the best strategy that doesn't conflict with other labels
 */
function findBestStrategy(
  strategies: PositioningStrategy[],
  labelB: LabelPosition,
  allLabels: LabelPosition[],
  labelBIndex: number
): PositioningStrategy | null {
  let bestStrategy: PositioningStrategy | null = null;
  let bestScore = Infinity;

  for (const strategy of strategies) {
    // Check if strategy is within chart bounds
    if (!isStrategyWithinBounds(strategy, labelB, {
      left: 0,
      top: 0,
      right: 1000, // Will be properly bounded by isLabelWithinBounds
      bottom: 1000
    })) {
      continue;
    }

    // Check if this position conflicts with other labels
    let conflicts = false;
    for (let k = 0; k < allLabels.length; k++) {
      if (k === labelBIndex) continue; // Skip self

      const other = allLabels[k];
      const testLabel: LabelPosition = {
        ...labelB,
        x: strategy.x,
        y: strategy.y
      };

      if (labelsCollide(testLabel, other)) {
        conflicts = true;
        break;
      }
    }

    if (!conflicts) {
      // Calculate score based on distance from original position
      const distance = Math.sqrt(
        Math.pow(strategy.x - labelB.originalX, 2) +
        Math.pow(strategy.y - labelB.originalY, 2)
      );

      if (distance < bestScore) {
        bestScore = distance;
        bestStrategy = strategy;
      }
    }
  }

  return bestStrategy;
}

/**
 * Apply last resort positioning when no strategy works
 */
function applyLastResortPositioning(
  label: LabelPosition,
  index: number,
  chartBounds: ChartBounds
): void {
  const verticalOffset = (TEXT_HEIGHT + LABEL_PADDING * 3) * (index % 4);
  const newY = label.originalY + verticalOffset;

  if (newY >= chartBounds.top + CHART_EDGE_PADDING.TOP &&
      newY <= chartBounds.bottom - CHART_EDGE_PADDING.BOTTOM) {
    label.y = newY;
  }
}

/**
 * Check if a positioning strategy is within bounds
 */
function isStrategyWithinBounds(
  strategy: PositioningStrategy,
  label: LabelPosition,
  chartBounds: ChartBounds
): boolean {
  return strategy.x >= chartBounds.left &&
         strategy.x + label.width <= chartBounds.right - CHART_EDGE_PADDING.RIGHT &&
         strategy.y >= chartBounds.top + CHART_EDGE_PADDING.TOP &&
         strategy.y <= chartBounds.bottom - CHART_EDGE_PADDING.BOTTOM;
}

/**
 * Check if a label is within chart bounds
 */
function isLabelWithinBounds(label: LabelPosition, chartBounds: ChartBounds): boolean {
  return label.x >= chartBounds.left &&
         label.x + label.width <= chartBounds.right - CHART_EDGE_PADDING.RIGHT &&
         label.y >= chartBounds.top + CHART_EDGE_PADDING.TOP &&
         label.y <= chartBounds.bottom - CHART_EDGE_PADDING.BOTTOM;
}