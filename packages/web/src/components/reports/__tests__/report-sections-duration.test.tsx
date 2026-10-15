import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendAtAGlanceCards } from '../TrendAtAGlanceCards';
import { DistributionSection } from '../DistributionSection';

const formats = { MILE_RUN: { unit: 's', displayFormat: 'duration' as const, decimalPrecision: 1 } };

describe('report sections: duration (mm:ss) metrics', () => {
  it('TrendAtAGlanceCards shows the latest value as m:ss', () => {
    render(
      <TrendAtAGlanceCards
        entries={[['MILE_RUN', { delta: { to: 402.5, pct: 2 }, benchmark: { kind: 'none' } }]]}
        metricUnits={{ MILE_RUN: 's' }}
        metricFormats={formats}
      />
    );
    expect(screen.getByText('6:42.5')).toBeInTheDocument();
  });

  it('DistributionSection shows the athlete value as m:ss', () => {
    render(
      <DistributionSection
        athleteName="Sam"
        distributions={{ MILE_RUN: { values: [395, 402.5, 410, 420], athleteValue: 402.5, direction: 'lower' } } as any}
        metricUnits={{ MILE_RUN: 's' }}
        metricFormats={formats}
      />
    );
    expect(screen.getAllByText(/6:42\.5/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/402\.5 s/)).toBeNull();
  });
});
