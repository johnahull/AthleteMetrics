import { describe, it, expect } from 'vitest';
import { computeDayCompliance } from '../wellness-compliance';

// Window = the last N complete UTC days, ending yesterday (2026-11-24)
const NOW = new Date('2026-11-25T15:00:00Z');

describe('computeDayCompliance', () => {
  it('request created today: no complete day yet, today\'s entry ignored, 0%', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-11-25T09:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a', 'b'],
      entries: [{ userId: 'a', date: '2026-11-25' }],
    });

    expect(result).toEqual({
      possibleDays: 0,
      entryDays: 0,
      totalPossibleDays: 0,
      percentage: 0,
      perAthlete: [
        { userId: 'a', entryDays: 0 },
        { userId: 'b', entryDays: 0 },
      ],
    });
  });

  it('created 2 days ago: possibleDays 2 (created day through yesterday)', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-11-23T23:59:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-23' },
        { userId: 'a', date: '2026-11-25' }, // today: not a complete day
      ],
    });

    expect(result.possibleDays).toBe(2);
    expect(result.entryDays).toBe(1);
    expect(result.percentage).toBe(50);
  });

  it('a daily checker scores 100% even before reaching today locally', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a'],
      entries: ['18', '19', '20', '21', '22', '23', '24'].map(d => ({ userId: 'a', date: `2026-11-${d}` })),
    });

    expect(result.possibleDays).toBe(7);
    expect(result.entryDays).toBe(7);
    expect(result.percentage).toBe(100);
  });

  it('caps possibleDays at the window and counts gaps as missing days', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-18' },
        { userId: 'a', date: '2026-11-21' },
        { userId: 'a', date: '2026-11-24' },
        { userId: 'a', date: '2026-11-25' }, // today: ignored
      ],
    });

    expect(result.possibleDays).toBe(7);
    expect(result.entryDays).toBe(3);
    expect(result.percentage).toBe(43);
  });

  it('counts two entries on one date once', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-24' },
        { userId: 'a', date: '2026-11-24' },
      ],
    });

    expect(result.perAthlete).toEqual([{ userId: 'a', entryDays: 1 }]);
  });

  it('ignores entries outside the window, before the request, from non-targets, and dated today or tomorrow', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-11-20T12:00:00Z'),
      now: NOW,
      windowDays: 28,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-19' }, // before the request's created date
        { userId: 'a', date: '2026-11-25' }, // today
        { userId: 'a', date: '2026-11-26' }, // tomorrow
        { userId: 'x', date: '2026-11-24' }, // not targeted
        { userId: 'a', date: '2026-11-20' },
      ],
    });

    expect(result.possibleDays).toBe(5);
    expect(result.perAthlete).toEqual([{ userId: 'a', entryDays: 1 }]);
    expect(result.entryDays).toBe(1);
  });

  it('drops dates older than the window', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-17' }, // 8 complete days back
        { userId: 'a', date: '2026-11-18' }, // 7th complete day back, inside
      ],
    });

    expect(result.entryDays).toBe(1);
  });

  it('zero targets: zero totals and 0%', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: [],
      entries: [{ userId: 'a', date: '2026-11-24' }],
    });

    expect(result).toEqual({
      possibleDays: 7,
      entryDays: 0,
      totalPossibleDays: 0,
      percentage: 0,
      perAthlete: [],
    });
  });
});
