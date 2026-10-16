import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierBadge } from '../TierBadge';

describe('TierBadge: duration (mm:ss) metric', () => {
  it('shows the distance to the next tier as m:ss with no unit', () => {
    render(
      <TierBadge tierName="Varsity" tierColor="blue" nextTierName="Elite" distanceToNextTier={4.2} unit="s"
        format={{ unit: 's', displayFormat: 'duration', decimalPrecision: 1 }} />
    );
    expect(screen.getByText(/0:04\.2\s+to Elite/)).toBeInTheDocument();
  });

  it('keeps a decimal distance with its unit', () => {
    render(<TierBadge tierName="Varsity" tierColor="blue" nextTierName="Elite" distanceToNextTier={2.5} unit="in" />);
    expect(screen.getByText(/2\.5\s+in to Elite/)).toBeInTheDocument();
  });
});
