/**
 * EventMetricsTab: the configured-metrics list shows the readable site metric
 * label, unit and category from `metricDetails` (the shape the server sends),
 * not the raw metric code.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

let eventMetricsState: any[] = [];
const idleMutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/lib/events-api', () => ({
  useEventMetrics: () => ({ data: eventMetricsState, isLoading: false }),
  useAddEventMetric: () => idleMutation,
  useRemoveEventMetric: () => idleMutation,
  useUpdateEventMetric: () => idleMutation,
  useReorderEventMetrics: () => idleMutation,
}));

vi.mock('@/lib/metrics-api', () => ({
  useSiteMetrics: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('../SaveEvalTemplateDialog', () => ({
  SaveEvalTemplateDialog: () => null,
}));

import { EventMetricsTab } from '../EventMetricsTab';

const eventMetric = (metricCode: string, displayOrder: number, extra: Record<string, unknown> = {}) => ({
  id: `em-${metricCode}`,
  eventId: 'ev-1',
  metricCode,
  displayOrder,
  isRequired: false,
  customLabel: null,
  ...extra,
});

describe('EventMetricsTab', () => {
  it('shows the readable label, unit and category from metricDetails, with the code as secondary text', () => {
    eventMetricsState = [
      eventMetric('VERTICAL_JUMP', 1, { metricDetails: { label: 'Vertical Jump', unit: 'in', category: 'power' } }),
      eventMetric('FLY10_TIME', 2, { customLabel: 'Fly 10 (cones)', metricDetails: { label: '10-Yard Fly', unit: 's', category: 'speed' } }),
      eventMetric('OLD_METRIC', 3, { metricDetails: null }),
    ];
    render(<EventMetricsTab eventId="ev-1" />);

    const vj = screen.getByText('Vertical Jump').closest('div.rounded-lg') as HTMLElement;
    expect(within(vj).getByText('VERTICAL_JUMP')).toBeInTheDocument();
    expect(within(vj).getByText('(in)')).toBeInTheDocument();
    expect(within(vj).getByText('power')).toBeInTheDocument();

    const fly = screen.getByText('Fly 10 (cones)').closest('div.rounded-lg') as HTMLElement;
    expect(within(fly).getByText('(s)')).toBeInTheDocument();
    expect(within(fly).getByText('speed')).toBeInTheDocument();

    // Site metric deleted later: the code is the only name left
    expect(screen.getAllByText('OLD_METRIC').length).toBeGreaterThan(0);
  });
});
