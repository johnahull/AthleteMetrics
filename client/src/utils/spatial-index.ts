/**
 * Spatial indexing utility for efficient label collision detection
 * Uses a grid-based approach for O(log n) collision checking
 */

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelPosition extends Rectangle {
  text: string;
  originalX: number;
  originalY: number;
}

/**
 * Grid-based spatial index for efficient collision detection
 */
export class SpatialIndex {
  private grid: Map<string, LabelPosition[]> = new Map();
  private gridSize: number;
  private lastCleanup: number = Date.now();
  private maxCellsBeforeCleanup: number = 1000;
  private cleanupIntervalMs: number = 30000; // 30 seconds

  constructor(gridSize: number = 50, maxCellsBeforeCleanup: number = 1000) {
    this.gridSize = gridSize;
    this.maxCellsBeforeCleanup = maxCellsBeforeCleanup;
  }

  /**
   * Get grid cell key for a position
   */
  private getGridKey(x: number, y: number): string {
    const gridX = Math.floor(x / this.gridSize);
    const gridY = Math.floor(y / this.gridSize);
    return `${gridX},${gridY}`;
  }

  /**
   * Get all grid cells that a rectangle intersects
   */
  private getIntersectingCells(rect: Rectangle): string[] {
    const cells: string[] = [];
    const minX = Math.floor(rect.x / this.gridSize);
    const maxX = Math.floor((rect.x + rect.width) / this.gridSize);
    const minY = Math.floor(rect.y / this.gridSize);
    const maxY = Math.floor((rect.y + rect.height) / this.gridSize);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.push(`${x},${y}`);
      }
    }
    return cells;
  }

  /**
   * Add a label to the spatial index
   */
  insert(label: LabelPosition): void {
    const cells = this.getIntersectingCells(label);
    for (const cell of cells) {
      if (!this.grid.has(cell)) {
        this.grid.set(cell, []);
      }
      this.grid.get(cell)!.push(label);
    }

    // Check if periodic cleanup is needed
    this.checkAndPerformCleanup();
  }

  /**
   * Check if a rectangle collides with any existing labels
   * Returns the first colliding label or null if no collision
   */
  checkCollision(rect: Rectangle, padding: number = 0): LabelPosition | null {
    const expandedRect = {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + 2 * padding,
      height: rect.height + 2 * padding,
    };

    const cells = this.getIntersectingCells(expandedRect);

    for (const cell of cells) {
      const labels = this.grid.get(cell);
      if (!labels) continue;

      for (const label of labels) {
        if (this.rectanglesOverlap(expandedRect, label)) {
          return label;
        }
      }
    }
    return null;
  }

  /**
   * Get all labels that could potentially collide with a rectangle
   */
  getNearbyLabels(rect: Rectangle, padding: number = 0): LabelPosition[] {
    const expandedRect = {
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + 2 * padding,
      height: rect.height + 2 * padding,
    };

    const cells = this.getIntersectingCells(expandedRect);
    const nearbyLabels = new Set<LabelPosition>();

    for (const cell of cells) {
      const labels = this.grid.get(cell);
      if (!labels) continue;

      for (const label of labels) {
        nearbyLabels.add(label);
      }
    }
    return Array.from(nearbyLabels);
  }

  /**
   * Check if two rectangles overlap
   */
  private rectanglesOverlap(rect1: Rectangle, rect2: Rectangle): boolean {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  /**
   * Clear the spatial index
   */
  clear(): void {
    this.grid.clear();
  }

  /**
   * Get statistics about the spatial index
   */
  getStats(): { cellCount: number; totalLabels: number; avgLabelsPerCell: number } {
    const cellCount = this.grid.size;
    const totalLabels = Array.from(this.grid.values()).reduce((sum, labels) => sum + labels.length, 0);
    const avgLabelsPerCell = cellCount > 0 ? totalLabels / cellCount : 0;

    return { cellCount, totalLabels, avgLabelsPerCell };
  }

  /**
   * Check if cleanup is needed and perform it
   */
  private checkAndPerformCleanup(): void {
    const now = Date.now();
    const shouldCleanupByTime = now - this.lastCleanup > this.cleanupIntervalMs;
    const shouldCleanupBySize = this.grid.size > this.maxCellsBeforeCleanup;

    if (shouldCleanupByTime || shouldCleanupBySize) {
      this.performCleanup();
      this.lastCleanup = now;
    }
  }

  /**
   * Perform cleanup to prevent memory accumulation
   * Removes empty cells and cells with stale data
   */
  private performCleanup(): void {
    const cellsToDelete: string[] = [];

    for (const [cellKey, labels] of this.grid.entries()) {
      // Remove empty cells
      if (labels.length === 0) {
        cellsToDelete.push(cellKey);
        continue;
      }

      // For cells with many labels, keep only the most recent ones
      if (labels.length > 50) {
        // Keep only the last 30 labels to prevent excessive memory usage
        labels.splice(0, labels.length - 30);
      }
    }

    // Delete empty cells
    for (const cellKey of cellsToDelete) {
      this.grid.delete(cellKey);
    }

    // If still too large, remove oldest cells (LRU style)
    if (this.grid.size > this.maxCellsBeforeCleanup * 0.8) {
      const entries = Array.from(this.grid.entries());
      // Remove oldest 20% of cells
      const cellsToRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < cellsToRemove; i++) {
        this.grid.delete(entries[i][0]);
      }
    }
  }

  /**
   * Force immediate cleanup
   */
  forceCleanup(): void {
    this.performCleanup();
    this.lastCleanup = Date.now();
  }

  /**
   * Get memory usage information
   */
  getMemoryInfo(): {
    cellCount: number;
    totalLabels: number;
    estimatedMemoryKB: number;
    needsCleanup: boolean;
  } {
    const stats = this.getStats();
    const estimatedMemoryKB = Math.round((stats.cellCount * 100 + stats.totalLabels * 200) / 1024); // Rough estimate
    const needsCleanup = this.grid.size > this.maxCellsBeforeCleanup * 0.7;

    return {
      cellCount: stats.cellCount,
      totalLabels: stats.totalLabels,
      estimatedMemoryKB,
      needsCleanup
    };
  }
}

/**
 * Efficient label collision resolution using spatial indexing
 */
export function resolveLabelsWithSpatialIndex(
  labels: LabelPosition[],
  chartBounds: { left: number; top: number; right: number; bottom: number },
  config: {
    maxLabels: number;
    padding: number;
    textHeight: number;
    gridSize: number;
    maxIterations: number;
  }
): LabelPosition[] {
  if (labels.length === 0) return [];

  const spatialIndex = new SpatialIndex(config.gridSize);
  const resolved: LabelPosition[] = [];

  // Sort labels by priority (could be by distance from original position, importance, etc.)
  const sortedLabels = [...labels].sort((a, b) => a.y - b.y);

  for (let i = 0; i < sortedLabels.length && resolved.length < config.maxLabels; i++) {
    const label = { ...sortedLabels[i] };
    let positioned = false;
    let iterations = 0;

    while (!positioned && iterations < config.maxIterations) {
      // Check if current position has collision
      const collision = spatialIndex.checkCollision(label, config.padding);

      if (!collision) {
        // Check bounds
        if (
          label.x >= chartBounds.left &&
          label.x + label.width <= chartBounds.right - 5 &&
          label.y >= chartBounds.top + 6 &&
          label.y <= chartBounds.bottom - 6
        ) {
          // Position is valid, add to index and resolved list
          spatialIndex.insert(label);
          resolved.push(label);
          positioned = true;
        } else {
          // Out of bounds, try to adjust position
          if (label.x + label.width > chartBounds.right - 5) {
            label.x = chartBounds.right - label.width - 5;
          }
          if (label.x < chartBounds.left) {
            label.x = chartBounds.left;
          }
          if (label.y < chartBounds.top + 6) {
            label.y = chartBounds.top + 6;
          }
          if (label.y > chartBounds.bottom - 6) {
            break; // Can't fit vertically, skip this label
          }
        }
      } else {
        // Collision detected, adjust position
        // Strategy: move down by text height + padding
        label.y = collision.y + collision.height + config.padding;

        // If moved too far down, try moving to the right
        if (label.y > chartBounds.bottom - config.textHeight - 6) {
          label.y = sortedLabels[i].y; // Reset Y
          label.x = collision.x + collision.width + config.padding;

          // If still colliding or out of bounds horizontally, skip this label
          if (label.x + label.width > chartBounds.right - 5) {
            break;
          }
        }
      }

      iterations++;
    }
  }

  return resolved;
}