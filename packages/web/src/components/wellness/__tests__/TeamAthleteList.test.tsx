/**
 * TeamAthleteList freshness (AM-FEAT-027): every roster athlete is listed with "last entry N days ago";
 * an athlete whose last entry is more than 2 days old (or who never submitted) shows a grey
 * "No recent data" state instead of red/yellow/green.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import TeamAthleteList from '../TeamAthleteList';

const athletes = [
  {
    id: 'a-fresh',
    name: 'Fresh Red',
    status: 'red' as const,
    score: 3,
    injuries: [],
    lastSubmission: new Date('2026-11-25T08:00:00'),
  },
];

const lastEntries = [
  { userId: 'a-fresh', name: 'Fresh Red', lastSubmittedAt: '2026-11-25T08:00:00Z', lastDate: '2026-11-25' },
  { userId: 'a-yesterday', name: 'Yesterday Athlete', lastSubmittedAt: '2026-11-24T08:00:00Z', lastDate: '2026-11-24' },
  { userId: 'a-stale', name: 'Stale Athlete', lastSubmittedAt: '2026-11-20T08:00:00Z', lastDate: '2026-11-20' },
  { userId: 'a-never', name: 'Never Athlete', lastSubmittedAt: null, lastDate: null },
];

const rowFor = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

describe('TeamAthleteList freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T12:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the status of an athlete with an entry and shows when it was', () => {
    render(<TeamAthleteList athletes={athletes} lastEntries={lastEntries} />);
    const row = rowFor('Fresh Red');
    expect(within(row).getByText('Red')).toBeInTheDocument();
    expect(within(row).getByText('last entry today')).toBeInTheDocument();
  });

  it('lists roster athletes without an entry on the date, grey "No recent data" when stale', () => {
    render(<TeamAthleteList athletes={athletes} lastEntries={lastEntries} />);

    const stale = rowFor('Stale Athlete');
    expect(within(stale).getByText('No recent data')).toBeInTheDocument();
    expect(within(stale).getByText('last entry 5 days ago')).toBeInTheDocument();
    expect(within(stale).getByRole('img')).toHaveAttribute('aria-label', 'Status: No recent data');

    const never = rowFor('Never Athlete');
    expect(within(never).getByText('No recent data')).toBeInTheDocument();
    expect(within(never).getByText('no entries yet')).toBeInTheDocument();

    const yesterday = rowFor('Yesterday Athlete');
    expect(within(yesterday).getByText('Not submitted')).toBeInTheDocument();
    expect(within(yesterday).getByText('last entry 1 day ago')).toBeInTheDocument();
    // The dot announces the same label the row shows
    expect(within(yesterday).getByRole('img')).toHaveAttribute('aria-label', 'Status: Not submitted');
    for (const label of ['Red', 'Yellow', 'Green']) {
      expect(within(stale).queryByText(label)).not.toBeInTheDocument();
      expect(within(yesterday).queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('renders as before without lastEntries', () => {
    render(<TeamAthleteList athletes={athletes} />);
    expect(screen.getAllByRole('row')).toHaveLength(2); // header + 1 athlete
    expect(screen.queryByText('No recent data')).not.toBeInTheDocument();
  });
});
