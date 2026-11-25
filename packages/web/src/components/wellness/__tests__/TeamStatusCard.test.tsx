/**
 * TeamStatusCard freshness (AM-FEAT-027): athletes with no recent data are counted in their own grey
 * bucket; the red/yellow/green counts are unchanged.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TeamStatusCard from '../TeamStatusCard';

const baseProps = {
  teamId: 't-1',
  teamName: 'Varsity',
  teamStatus: 'green' as const,
  teamAverageScore: 7,
  scaleMax: 10,
  redCount: 0,
  yellowCount: 0,
  greenCount: 1,
  totalAthletes: 3,
  completionRate: 33,
  trend: 'stable' as const,
  commonInjuries: [],
  athletes: [
    { id: 'a-1', name: 'Today', status: 'green' as const, score: 7, injuries: [], lastSubmission: new Date() },
  ],
};

describe('TeamStatusCard freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('counts athletes without an entry and stale as "no recent data"', () => {
    render(
      <TeamStatusCard
        {...baseProps}
        lastEntries={[
          { userId: 'a-1', name: 'Today', lastSubmittedAt: '2026-11-25T08:00:00Z', lastDate: '2026-11-25' },
          { userId: 'a-2', name: 'Yesterday', lastSubmittedAt: '2026-11-24T08:00:00Z', lastDate: '2026-11-24' },
          { userId: 'a-3', name: 'Stale', lastSubmittedAt: '2026-11-01T08:00:00Z', lastDate: '2026-11-01' },
          { userId: 'a-4', name: 'Never', lastSubmittedAt: null, lastDate: null },
        ]}
      />
    );
    expect(screen.getByTestId('no-recent-data-count')).toHaveTextContent(/^2\s*no recent data$/);
    expect(screen.getByText('green').previousElementSibling).toHaveTextContent('1');
  });

  it('omits the bucket without lastEntries', () => {
    render(<TeamStatusCard {...baseProps} />);
    expect(screen.queryByTestId('no-recent-data-count')).not.toBeInTheDocument();
  });
});

describe('TeamStatusCard earlier pain reports', () => {
  const entry = (painAreas: string[]) => [{ id: 'r-1', submittedAt: '2026-11-25T07:30:00', answers: [], painAreas }];
  const athlete = (id: string, painAreas: string[]) => ({ ...baseProps.athletes[0], id, earlierEntries: entry(painAreas) });

  it('says on the collapsed card how many athletes have an earlier pain report', () => {
    render(<TeamStatusCard {...baseProps} athletes={[athlete('a-1', ['Left knee']), athlete('a-2', [])]} />);
    expect(screen.getByTestId('earlier-pain-notice')).toHaveTextContent(
      '1 athlete has an earlier pain report that was edited'
    );
  });

  it('uses the plural, and shows nothing when no earlier entry had pain', () => {
    const { rerender } = render(
      <TeamStatusCard {...baseProps} athletes={[athlete('a-1', ['Knee']), athlete('a-2', ['Hip'])]} />
    );
    expect(screen.getByTestId('earlier-pain-notice')).toHaveTextContent('2 athletes have an earlier pain report');
    rerender(<TeamStatusCard {...baseProps} athletes={[athlete('a-1', [])]} />);
    expect(screen.queryByTestId('earlier-pain-notice')).not.toBeInTheDocument();
  });
});
