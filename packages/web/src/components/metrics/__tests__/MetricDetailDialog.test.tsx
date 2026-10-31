import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MetricDetailDialog } from '../MetricDetailDialog';

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const base = {
  code: 'FLY10_TIME',
  label: '10-Yard Fly',
  category: 'speed',
  unit: 's',
  metricType: 'lower_is_better',
  description: 'Time over a flying 10 yards',
  validationMin: 0.5,
  validationMax: 5,
  decimalPrecision: 2,
  displayFormat: 'decimal',
  sportAssociations: ['Football'],
  isDerived: false,
  formula: null,
  dependentMetrics: null,
} as any;

describe('MetricDetailDialog', () => {
  it('shows definition details for a measured metric', () => {
    render(<MetricDetailDialog metric={base} open onOpenChange={() => {}} />);
    expect(screen.getByText('10-Yard Fly')).toBeInTheDocument();
    expect(screen.getByText('Lower is Better')).toBeInTheDocument();
    expect(screen.getByText('Time over a flying 10 yards')).toBeInTheDocument();
    expect(screen.getByText(/0\.5 – 5/)).toBeInTheDocument();
    expect(screen.getByText('2 decimals')).toBeInTheDocument();
    expect(screen.getByText('Football')).toBeInTheDocument();
    expect(screen.queryByText('Calculated')).not.toBeInTheDocument();
  });

  it('flags a derived metric as calculated and shows formula and inputs', () => {
    const derived = {
      ...base,
      code: 'RSI',
      label: 'RSI',
      isDerived: true,
      formula: 'JUMP_HEIGHT / GROUND_CONTACT_TIME',
      dependentMetrics: ['JUMP_HEIGHT', 'GROUND_CONTACT_TIME'],
    };
    render(<MetricDetailDialog metric={derived} open onOpenChange={() => {}} />);
    expect(screen.getByText('Calculated')).toBeInTheDocument();
    expect(screen.getByText('JUMP_HEIGHT / GROUND_CONTACT_TIME')).toBeInTheDocument();
    expect(screen.getByText('JUMP_HEIGHT')).toBeInTheDocument();
    expect(screen.getByText('GROUND_CONTACT_TIME')).toBeInTheDocument();
  });

  it('renders nothing when closed', () => {
    render(<MetricDetailDialog metric={base} open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText('10-Yard Fly')).not.toBeInTheDocument();
  });
});
