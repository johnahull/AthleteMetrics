import { describe, it, expect } from 'vitest';
import { groupPickerMetrics } from '../metric-groups';

const m = (metricCode: string, label: string, category: string | null, customLabel?: string) =>
  ({ metricCode, customLabel, siteMetric: { label, category, unit: 's' } }) as any;

const labels = (groups: ReturnType<typeof groupPickerMetrics>) =>
  groups.map((g) => ({ label: g.label, metrics: g.metrics.map((x) => x.metricCode) }));

describe('groupPickerMetrics', () => {
  it('orders groups by the fixed group order and drops empty ones', () => {
    const out = groupPickerMetrics([
      m('VERTICAL_JUMP', 'Vertical Jump (in)', 'Power'),
      m('DASH_40YD', '40-Yard Dash', 'speed'),
    ]);
    expect(out.map((g) => g.label)).toEqual(['Speed', 'Power']);
  });

  it('sorts labels numerically inside a group (5 yd before 30 yd, 5-0-5 before 5-10-5)', () => {
    const out = groupPickerMetrics([
      m('FLY10_TIME_RI30', '10-Yard Fly, 30 yd run-in', 'speed'),
      m('DASH_40YD', '40-Yard Dash', 'speed'),
      m('FLY10_TIME_RI5', '10-Yard Fly, 5 yd run-in', 'speed'),
      m('AGILITY_5105', '5-10-5 Agility', 'agility'),
      m('AGILITY_505_M', '5-0-5 Agility (m)', 'agility'),
    ]);
    expect(labels(out)).toEqual([
      { label: 'Speed', metrics: ['FLY10_TIME_RI5', 'FLY10_TIME_RI30', 'DASH_40YD'] },
      { label: 'Agility', metrics: ['AGILITY_505_M', 'AGILITY_5105'] },
    ]);
  });

  it('keeps the base test ahead of its Left/Right variants', () => {
    const out = groupPickerMetrics([
      m('AGILITY_505_M_R', '5-0-5 Agility (m, Right)', 'agility'),
      m('AGILITY_505_M_L', '5-0-5 Agility (m, Left)', 'agility'),
      m('AGILITY_505_M', '5-0-5 Agility (m)', 'agility'),
    ]);
    expect(out[0].metrics.map((x) => x.metricCode)).toEqual([
      'AGILITY_505_M',
      'AGILITY_505_M_L',
      'AGILITY_505_M_R',
    ]);
  });

  it('maps inconsistent categories into the right group and unknown ones to Other', () => {
    const out = groupPickerMetrics([
      m('CUSTOM_X', 'Zeta', 'Weird Thing'),
      m('CUSTOM_Y', 'Alpha', 'Acceleration'),
    ]);
    expect(labels(out)).toEqual([
      { label: 'Speed', metrics: ['CUSTOM_Y'] },
      { label: 'Other', metrics: ['CUSTOM_X'] },
    ]);
  });

  it('sorts by customLabel when set, else the site label', () => {
    const out = groupPickerMetrics([
      m('CUSTOM_A', 'Apple', 'custom'),
      m('CUSTOM_B', 'Zebra', 'custom', 'Banana'),
    ]);
    expect(out[0].metrics.map((x) => x.metricCode)).toEqual(['CUSTOM_A', 'CUSTOM_B']);
  });

  it('returns no groups for an empty list', () => {
    expect(groupPickerMetrics([])).toEqual([]);
  });
});
