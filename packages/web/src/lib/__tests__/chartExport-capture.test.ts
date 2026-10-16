import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => ({ toDataURL: () => 'data:image/png;base64,AAAA' })),
}));

import { captureTrendCharts } from '../chartExport';

describe('captureTrendCharts metric group', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sends the group and label of the wrapper around a grouped chart', async () => {
    document.body.innerHTML =
      '<div data-metric-group="speed" data-metric-group-label="Speed"><div data-chart-metric="DASH_10YD"></div></div>';
    const [chart] = await captureTrendCharts();
    expect(chart).toMatchObject({ metricCode: 'DASH_10YD', group: 'speed', groupLabel: 'Speed' });
  });

  it('omits the group on a section-level chart', async () => {
    document.body.innerHTML = '<div data-report-chart="radar"></div>';
    const [chart] = await captureTrendCharts();
    expect(chart.metricCode).toBe('radar');
    expect(chart.group).toBeUndefined();
    expect(chart.groupLabel).toBeUndefined();
  });
});
