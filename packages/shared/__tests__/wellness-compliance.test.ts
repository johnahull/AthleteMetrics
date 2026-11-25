import { describe, it, expect } from 'vitest';
import { computeDayCompliance } from '../wellness-compliance';

const NOW = new Date('2026-11-25T15:00:00Z');

describe('computeDayCompliance', () => {
  it('request created today: one possible day', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-11-25T09:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a', 'b'],
      entries: [{ userId: 'a', date: '2026-11-25' }],
    });

    expect(result).toEqual({
      possibleDays: 1,
      entryDays: 1,
      totalPossibleDays: 2,
      percentage: 50,
      perAthlete: [
        { userId: 'a', entryDays: 1 },
        { userId: 'b', entryDays: 0 },
      ],
    });
  });

  it('created 3 days ago (inclusive of today): possibleDays 3 < 7', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-11-23T23:59:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-23' },
        { userId: 'a', date: '2026-11-25' },
      ],
    });

    expect(result.possibleDays).toBe(3);
    expect(result.entryDays).toBe(2);
    expect(result.percentage).toBe(67);
  });

  it('caps possibleDays at the window and counts gaps as missing days', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-01-01T00:00:00Z'),
      now: NOW,
      windowDays: 7,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-19' },
        { userId: 'a', date: '2026-11-21' },
        { userId: 'a', date: '2026-11-25' },
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

  it('ignores entries outside the window, before the request, from non-targets, and dated tomorrow', () => {
    const result = computeDayCompliance({
      createdAt: new Date('2026-11-20T12:00:00Z'),
      now: NOW,
      windowDays: 28,
      targetUserIds: ['a'],
      entries: [
        { userId: 'a', date: '2026-11-19' }, // before the request's created date
        { userId: 'a', date: '2026-11-26' }, // tomorrow
        { userId: 'x', date: '2026-11-25' }, // not targeted
        { userId: 'a', date: '2026-11-20' },
      ],
    });

    expect(result.possibleDays).toBe(6);
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
        { userId: 'a', date: '2026-11-18' }, // 8 days ago
        { userId: 'a', date: '2026-11-19' }, // 7th day back, inside
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
      entries: [{ userId: 'a', date: '2026-11-25' }],
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
