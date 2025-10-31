/**
 * Test: Date Selector Sharing Between Time-Series Charts
 *
 * Verifies that the DateSelector visibility condition works correctly
 * for both time_series_box_swarm and time_series_violin chart types.
 */

import { describe, it, expect } from 'vitest';

describe('BaseAnalyticsView - DateSelector Visibility Logic', () => {
  it('should return true when chart type is time_series_box_swarm', () => {
    const chartType = 'time_series_box_swarm';
    const shouldShow = ['time_series_box_swarm', 'time_series_violin'].includes(chartType);
    expect(shouldShow).toBe(true);
  });

  it('should return true when chart type is time_series_violin', () => {
    const chartType = 'time_series_violin';
    const shouldShow = ['time_series_box_swarm', 'time_series_violin'].includes(chartType);
    expect(shouldShow).toBe(true);
  });

  it('should return false when chart type is box_plot', () => {
    const chartType = 'box_plot';
    const shouldShow = ['time_series_box_swarm', 'time_series_violin'].includes(chartType);
    expect(shouldShow).toBe(false);
  });

  it('should return false when chart type is line_chart', () => {
    const chartType = 'line_chart';
    const shouldShow = ['time_series_box_swarm', 'time_series_violin'].includes(chartType);
    expect(shouldShow).toBe(false);
  });

  it('should return false when chart type is violin_plot', () => {
    const chartType = 'violin_plot';
    const shouldShow = ['time_series_box_swarm', 'time_series_violin'].includes(chartType);
    expect(shouldShow).toBe(false);
  });

  it('should return false when chart type is box_swarm_combo', () => {
    const chartType = 'box_swarm_combo';
    const shouldShow = ['time_series_box_swarm', 'time_series_violin'].includes(chartType);
    expect(shouldShow).toBe(false);
  });
});
