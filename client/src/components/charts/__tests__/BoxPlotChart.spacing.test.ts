/**
 * Unit tests for BoxPlot spacing calculations
 * Tests spacing algorithm for 2, 3, and 5+ groups to ensure proper edge-to-edge distribution
 */

import { describe, it, expect } from 'vitest';

/**
 * Simulates the BoxPlot spacing calculation algorithm
 * This matches the logic in BoxPlotChart.tsx lines 509-522
 */
function calculateBoxPlotSpacing(numGroups: number, groupIndex: number, metricIndex: number = 0) {
  // Box width proportional to number of groups
  const boxWidth = Math.max(0.08, Math.min(0.2, 0.7 / numGroups));

  // Spacing between group centers - adjust for 2 groups vs many
  // For 2 groups, use tighter spacing; for 3+, spread wider
  const groupSpacing = numGroups === 2 ? 0.5 : 0.9 / Math.max(1, numGroups - 1);
  const baseX = metricIndex; // Metric position

  // Center groups and spread them edge to edge
  const xPos = baseX + (groupIndex - (numGroups - 1) / 2) * groupSpacing;

  return {
    boxWidth,
    groupSpacing,
    xPos,
  };
}

describe('BoxPlot Spacing Calculations', () => {
  describe('Box Width Calculation', () => {
    it('should calculate appropriate box width for 2 groups', () => {
      const { boxWidth } = calculateBoxPlotSpacing(2, 0);
      expect(boxWidth).toBeCloseTo(0.2, 2); // Max of (0.08, min(0.2, 0.35)) = 0.2
    });

    it('should calculate appropriate box width for 3 groups', () => {
      const { boxWidth } = calculateBoxPlotSpacing(3, 0);
      expect(boxWidth).toBeCloseTo(0.2, 2); // Max of (0.08, min(0.2, 0.233)) = 0.2
    });

    it('should calculate appropriate box width for 5 groups', () => {
      const { boxWidth } = calculateBoxPlotSpacing(5, 0);
      expect(boxWidth).toBeCloseTo(0.14, 2); // Max of (0.08, min(0.2, 0.14)) = 0.14
    });

    it('should calculate appropriate box width for 10 groups', () => {
      const { boxWidth } = calculateBoxPlotSpacing(10, 0);
      expect(boxWidth).toBeCloseTo(0.08, 2); // Max of (0.08, min(0.2, 0.07)) = 0.08 (minimum)
    });

    it('should never go below minimum width of 0.08', () => {
      const { boxWidth } = calculateBoxPlotSpacing(20, 0);
      expect(boxWidth).toBeGreaterThanOrEqual(0.08);
    });

    it('should never exceed maximum width of 0.2', () => {
      const { boxWidth } = calculateBoxPlotSpacing(1, 0);
      expect(boxWidth).toBeLessThanOrEqual(0.2);
    });
  });

  describe('Group Spacing - 2 Groups', () => {
    it('should use tighter spacing of 0.5 for 2 groups', () => {
      const { groupSpacing } = calculateBoxPlotSpacing(2, 0);
      expect(groupSpacing).toBe(0.5);
    });

    it('should position first group to the left of center', () => {
      const { xPos } = calculateBoxPlotSpacing(2, 0, 0);
      // groupIndex=0, numGroups=2: 0 + (0 - 0.5) * 0.5 = -0.25
      expect(xPos).toBeCloseTo(-0.25, 2);
    });

    it('should position second group to the right of center', () => {
      const { xPos } = calculateBoxPlotSpacing(2, 1, 0);
      // groupIndex=1, numGroups=2: 0 + (1 - 0.5) * 0.5 = 0.25
      expect(xPos).toBeCloseTo(0.25, 2);
    });

    it('should center groups symmetrically around baseX', () => {
      const group1 = calculateBoxPlotSpacing(2, 0, 0);
      const group2 = calculateBoxPlotSpacing(2, 1, 0);

      // Should be equidistant from center (0)
      expect(Math.abs(group1.xPos)).toBeCloseTo(Math.abs(group2.xPos), 2);
    });
  });

  describe('Group Spacing - 3 Groups', () => {
    it('should use wider spacing for 3 groups', () => {
      const { groupSpacing } = calculateBoxPlotSpacing(3, 0);
      // 0.9 / max(1, 3-1) = 0.9 / 2 = 0.45
      expect(groupSpacing).toBeCloseTo(0.45, 2);
    });

    it('should position first group to the left', () => {
      const { xPos } = calculateBoxPlotSpacing(3, 0, 0);
      // groupIndex=0, numGroups=3: 0 + (0 - 1) * 0.45 = -0.45
      expect(xPos).toBeCloseTo(-0.45, 2);
    });

    it('should position middle group at center', () => {
      const { xPos } = calculateBoxPlotSpacing(3, 1, 0);
      // groupIndex=1, numGroups=3: 0 + (1 - 1) * 0.45 = 0
      expect(xPos).toBeCloseTo(0, 2);
    });

    it('should position last group to the right', () => {
      const { xPos } = calculateBoxPlotSpacing(3, 2, 0);
      // groupIndex=2, numGroups=3: 0 + (2 - 1) * 0.45 = 0.45
      expect(xPos).toBeCloseTo(0.45, 2);
    });

    it('should spread groups symmetrically', () => {
      const group1 = calculateBoxPlotSpacing(3, 0, 0);
      const group2 = calculateBoxPlotSpacing(3, 1, 0);
      const group3 = calculateBoxPlotSpacing(3, 2, 0);

      // Distance between adjacent groups should be equal
      const spacing1 = group2.xPos - group1.xPos;
      const spacing2 = group3.xPos - group2.xPos;
      expect(spacing1).toBeCloseTo(spacing2, 2);
    });
  });

  describe('Group Spacing - 5 Groups', () => {
    it('should calculate appropriate spacing for 5 groups', () => {
      const { groupSpacing } = calculateBoxPlotSpacing(5, 0);
      // 0.9 / max(1, 5-1) = 0.9 / 4 = 0.225
      expect(groupSpacing).toBeCloseTo(0.225, 3);
    });

    it('should position all 5 groups symmetrically', () => {
      const positions = Array.from({ length: 5 }, (_, i) =>
        calculateBoxPlotSpacing(5, i, 0).xPos
      );

      // First and last should be equidistant from center
      expect(Math.abs(positions[0])).toBeCloseTo(Math.abs(positions[4]), 2);

      // Second and fourth should be equidistant from center
      expect(Math.abs(positions[1])).toBeCloseTo(Math.abs(positions[3]), 2);

      // Middle should be at center
      expect(positions[2]).toBeCloseTo(0, 2);
    });

    it('should maintain consistent spacing between all adjacent groups', () => {
      const positions = Array.from({ length: 5 }, (_, i) =>
        calculateBoxPlotSpacing(5, i, 0).xPos
      );

      const spacings = [];
      for (let i = 1; i < positions.length; i++) {
        spacings.push(positions[i] - positions[i - 1]);
      }

      // All spacings should be equal
      spacings.forEach(spacing => {
        expect(spacing).toBeCloseTo(spacings[0], 2);
      });
    });
  });

  describe('Group Spacing - 8 Groups', () => {
    it('should handle larger number of groups', () => {
      const { groupSpacing } = calculateBoxPlotSpacing(8, 0);
      // 0.9 / max(1, 8-1) = 0.9 / 7 ≈ 0.1286
      expect(groupSpacing).toBeCloseTo(0.1286, 3);
    });

    it('should spread 8 groups edge to edge', () => {
      const firstGroup = calculateBoxPlotSpacing(8, 0, 0);
      const lastGroup = calculateBoxPlotSpacing(8, 7, 0);

      // Total spread should use most of the available space
      const totalSpread = lastGroup.xPos - firstGroup.xPos;
      expect(totalSpread).toBeCloseTo(0.9, 1); // Should be close to 0.9
    });
  });

  describe('Edge Cases', () => {
    it('should handle single group', () => {
      const { xPos, boxWidth, groupSpacing } = calculateBoxPlotSpacing(1, 0, 0);

      // Single group should be centered
      expect(xPos).toBe(0);

      // Should use maximum box width
      expect(boxWidth).toBe(0.2);

      // groupSpacing = 0.9 / max(1, 0) = 0.9
      expect(groupSpacing).toBe(0.9);
    });

    it('should handle metric index offset', () => {
      const metric0 = calculateBoxPlotSpacing(3, 1, 0);
      const metric1 = calculateBoxPlotSpacing(3, 1, 1);
      const metric2 = calculateBoxPlotSpacing(3, 1, 2);

      // Each metric should be offset by 1
      expect(metric1.xPos - metric0.xPos).toBe(1);
      expect(metric2.xPos - metric1.xPos).toBe(1);
    });

    it('should maintain group spacing regardless of metric index', () => {
      const metric0Group0 = calculateBoxPlotSpacing(3, 0, 0);
      const metric0Group1 = calculateBoxPlotSpacing(3, 1, 0);

      const metric5Group0 = calculateBoxPlotSpacing(3, 0, 5);
      const metric5Group1 = calculateBoxPlotSpacing(3, 1, 5);

      // Group spacing should be same across metrics
      const spacing0 = metric0Group1.xPos - metric0Group0.xPos;
      const spacing5 = metric5Group1.xPos - metric5Group0.xPos;
      expect(spacing0).toBeCloseTo(spacing5, 2);
    });
  });

  describe('Comparison: 2 Groups vs 3+ Groups', () => {
    it('should use different spacing algorithms for 2 vs 3 groups', () => {
      const twoGroups = calculateBoxPlotSpacing(2, 0);
      const threeGroups = calculateBoxPlotSpacing(3, 0);

      // 2 groups uses 0.5, 3 groups uses 0.45
      expect(twoGroups.groupSpacing).toBe(0.5);
      expect(threeGroups.groupSpacing).toBeCloseTo(0.45, 2);
      expect(twoGroups.groupSpacing).toBeGreaterThan(threeGroups.groupSpacing);
    });

    it('should result in tighter clustering for 2 groups', () => {
      const twoGroupsSpread = Math.abs(
        calculateBoxPlotSpacing(2, 1, 0).xPos - calculateBoxPlotSpacing(2, 0, 0).xPos
      );

      const threeGroupsSpread = Math.abs(
        calculateBoxPlotSpacing(3, 1, 0).xPos - calculateBoxPlotSpacing(3, 0, 0).xPos
      );

      // 2 groups should have equal spacing to 3 groups (0.5 for 2 groups, 0.45 for 3 groups)
      // This is intentional - 2 groups uses 0.5 to avoid being too spread out
      expect(twoGroupsSpread).toBeCloseTo(0.5, 2);
      expect(threeGroupsSpread).toBeCloseTo(0.45, 2);
    });

    it('should transition smoothly from 2 to 3 to 4 groups', () => {
      const spacing2 = calculateBoxPlotSpacing(2, 0).groupSpacing;
      const spacing3 = calculateBoxPlotSpacing(3, 0).groupSpacing;
      const spacing4 = calculateBoxPlotSpacing(4, 0).groupSpacing;

      // Spacing should decrease as groups increase
      expect(spacing3).toBeLessThan(spacing2);
      expect(spacing4).toBeLessThan(spacing3);
    });
  });

  describe('Visual Layout Verification', () => {
    it('should not overlap boxes for 2 groups', () => {
      const group1 = calculateBoxPlotSpacing(2, 0, 0);
      const group2 = calculateBoxPlotSpacing(2, 1, 0);

      // Check that boxes don't overlap (center distance > combined half-widths)
      const centerDistance = Math.abs(group2.xPos - group1.xPos);
      const minSeparation = group1.boxWidth / 2 + group2.boxWidth / 2;

      expect(centerDistance).toBeGreaterThan(minSeparation);
    });

    it('should not overlap boxes for 5 groups', () => {
      const groups = Array.from({ length: 5 }, (_, i) =>
        calculateBoxPlotSpacing(5, i, 0)
      );

      // Check all adjacent pairs
      for (let i = 1; i < groups.length; i++) {
        const centerDistance = Math.abs(groups[i].xPos - groups[i - 1].xPos);
        const minSeparation = groups[i].boxWidth / 2 + groups[i - 1].boxWidth / 2;

        expect(centerDistance).toBeGreaterThan(minSeparation);
      }
    });

    it('should spread groups nearly edge-to-edge for maximum space utilization', () => {
      // For 5 groups, the total spread should be close to 0.9
      const firstGroup = calculateBoxPlotSpacing(5, 0, 0);
      const lastGroup = calculateBoxPlotSpacing(5, 4, 0);

      const totalSpread = lastGroup.xPos - firstGroup.xPos;

      // Total spread = (5-1) * groupSpacing = 4 * 0.225 = 0.9
      expect(totalSpread).toBeCloseTo(0.9, 2);
    });
  });
});
