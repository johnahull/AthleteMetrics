/**
 * Wellness Analytics Utilities - Unit Tests
 *
 * Test-first implementation of shared wellness calculation utilities.
 * These tests define the expected behavior before implementation.
 */

import { describe, it, expect } from 'vitest';
import type { WellnessResponse, WellnessResponseData, WellnessTemplate } from '@shared/wellness-types';
import {
  calculateAverageWellness,
  calculateTrend,
  groupResponsesByDate,
  filterResponsesByDateRange,
  aggregateStatusCounts,
  groupResponsesByAthlete,
  calculateAthleteStatus, // re-exported from wellness-status-utils
} from '../wellness-analytics';

// Mock data helpers
function createMockResponse(
  overrides: Partial<WellnessResponse> = {}
): WellnessResponse {
  return {
    id: overrides.id || 'response-1',
    requestId: 'request-1',
    organizationId: 'org-1',
    templateId: 'template-1',
    userId: overrides.userId || 'user-1',
    userFullName: 'Test User',
    teamId: 'team-1',
    teamNameSnapshot: 'Test Team',
    submittedAt: new Date('2025-01-15T10:00:00Z'),
    date: overrides.date || '2025-01-15',
    responses: overrides.responses || {
      'q1': { value: 5, label: 'Question 1' },
      'q2': { value: 7, label: 'Question 2' },
    },
    accessMethod: 'web',
    ipAddress: '127.0.0.1',
    userAgent: 'test',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  };
}

function createMockTemplate(
  overrides: Partial<WellnessTemplate> = {}
): WellnessTemplate {
  return {
    id: 'template-1',
    name: 'Test Template',
    organizationId: 'org-1',
    createdBy: 'user-1',
    config: {
      questions: [
        {
          id: 'q1',
          type: 'scale',
          label: 'Question 1',
          required: true,
          scaleMin: 1,
          scaleMax: 10,
        },
        {
          id: 'q2',
          type: 'scale',
          label: 'Question 2',
          required: true,
          scaleMin: 1,
          scaleMax: 10,
        },
      ],
      statusConfig: {
        scaleOrientation: 'higher_is_better',
        calculationMethod: 'average',
        redThreshold: 3,
        yellowThreshold: 7,
        injuryQuestionIds: [],
        injuryOverride: true,
      },
    },
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    isActive: true,
    isGlobal: false,
    ...overrides,
  };
}

describe('calculateAverageWellness', () => {
  it('calculates arithmetic mean of all numeric response values', () => {
    const responses = [
      createMockResponse({
        responses: {
          'q1': { value: 5, label: 'Q1' },
          'q2': { value: 7, label: 'Q2' },
        },
      }),
      createMockResponse({
        responses: {
          'q1': { value: 3, label: 'Q1' },
          'q2': { value: 9, label: 'Q2' },
        },
      }),
    ];

    // Expected: (5 + 7 + 3 + 9) / 4 = 24 / 4 = 6
    expect(calculateAverageWellness(responses)).toBe(6);
  });

  it('ignores non-numeric values', () => {
    const responses = [
      createMockResponse({
        responses: {
          'q1': { value: 5, label: 'Q1' },
          'q2': { value: 'text response', label: 'Q2' },
          'q3': { value: 7, label: 'Q3' },
        },
      }),
    ];

    // Expected: (5 + 7) / 2 = 12 / 2 = 6
    expect(calculateAverageWellness(responses)).toBe(6);
  });

  it('returns 0 for empty array', () => {
    expect(calculateAverageWellness([])).toBe(0);
  });

  it('returns 0 when no valid numeric responses', () => {
    const responses = [
      createMockResponse({
        responses: {
          'q1': { value: 'text', label: 'Q1' },
          'q2': { value: 'more text', label: 'Q2' },
        },
      }),
    ];

    expect(calculateAverageWellness(responses)).toBe(0);
  });

  it('supports optional question filter function', () => {
    const responses = [
      createMockResponse({
        responses: {
          'q1': { value: 5, label: 'Q1' },
          'q2': { value: 7, label: 'Q2' },
          'q3': { value: 9, label: 'Q3' },
        },
      }),
    ];

    // Filter to only include q1 and q2
    const questionFilter = (questionId: string) => ['q1', 'q2'].includes(questionId);
    const avg = calculateAverageWellness(responses, questionFilter);

    // Expected: (5 + 7) / 2 = 6
    expect(avg).toBe(6);
  });

  it('handles single response', () => {
    const responses = [
      createMockResponse({
        responses: {
          'q1': { value: 8, label: 'Q1' },
        },
      }),
    ];

    expect(calculateAverageWellness(responses)).toBe(8);
  });

  it('handles decimal averages correctly', () => {
    const responses = [
      createMockResponse({
        responses: {
          'q1': { value: 5, label: 'Q1' },
          'q2': { value: 6, label: 'Q2' },
          'q3': { value: 7, label: 'Q3' },
        },
      }),
    ];

    // Expected: (5 + 6 + 7) / 3 = 18 / 3 = 6
    expect(calculateAverageWellness(responses)).toBe(6);
  });
});

describe('calculateTrend', () => {
  it('returns "up" when second half average is higher (higher_is_better)', () => {
    const responses = [
      createMockResponse({ date: '2025-01-01', responses: { 'q1': { value: 3, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-02', responses: { 'q1': { value: 4, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-03', responses: { 'q1': { value: 7, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-04', responses: { 'q1': { value: 8, label: 'Q1' } } }),
    ];

    // First half: (3 + 4) / 2 = 3.5
    // Second half: (7 + 8) / 2 = 7.5
    // Difference: 4.0 > 0.5 threshold → 'up'
    expect(calculateTrend(responses, 'higher_is_better', 10)).toBe('up');
  });

  it('returns "down" when second half average is lower (higher_is_better)', () => {
    const responses = [
      createMockResponse({ date: '2025-01-01', responses: { 'q1': { value: 8, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-02', responses: { 'q1': { value: 7, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-03', responses: { 'q1': { value: 3, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-04', responses: { 'q1': { value: 4, label: 'Q1' } } }),
    ];

    // First half: (8 + 7) / 2 = 7.5
    // Second half: (3 + 4) / 2 = 3.5
    // Difference: -4.0 < -0.5 threshold → 'down'
    expect(calculateTrend(responses, 'higher_is_better', 10)).toBe('down');
  });

  it('returns "stable" when difference is below threshold (higher_is_better)', () => {
    const responses = [
      createMockResponse({ date: '2025-01-01', responses: { 'q1': { value: 5, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-02', responses: { 'q1': { value: 5, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-03', responses: { 'q1': { value: 5.2, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-04', responses: { 'q1': { value: 5.3, label: 'Q1' } } }),
    ];

    // First half: (5 + 5) / 2 = 5.0
    // Second half: (5.2 + 5.3) / 2 = 5.25
    // Difference: 0.25 < 0.5 threshold → 'stable'
    expect(calculateTrend(responses, 'higher_is_better', 10)).toBe('stable');
  });

  it('inverts trend for lower_is_better orientation', () => {
    const responses = [
      createMockResponse({ date: '2025-01-01', responses: { 'q1': { value: 8, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-02', responses: { 'q1': { value: 7, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-03', responses: { 'q1': { value: 3, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-04', responses: { 'q1': { value: 4, label: 'Q1' } } }),
    ];

    // First half: (8 + 7) / 2 = 7.5
    // Second half: (3 + 4) / 2 = 3.5
    // Score decreased: 3.5 - 7.5 = -4.0
    // For lower_is_better: score decrease = improvement → 'up'
    expect(calculateTrend(responses, 'lower_is_better', 10)).toBe('up');
  });

  it('returns "stable" for less than 2 responses', () => {
    expect(calculateTrend([], 'higher_is_better', 10)).toBe('stable');
    expect(calculateTrend([createMockResponse()], 'higher_is_better', 10)).toBe('stable');
  });

  it('sorts responses by date before calculating', () => {
    // Deliberately out of order
    const responses = [
      createMockResponse({ date: '2025-01-04', responses: { 'q1': { value: 8, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-01', responses: { 'q1': { value: 3, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-03', responses: { 'q1': { value: 7, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-02', responses: { 'q1': { value: 4, label: 'Q1' } } }),
    ];

    // After sorting: 3, 4, 7, 8
    // First half: (3 + 4) / 2 = 3.5
    // Second half: (7 + 8) / 2 = 7.5
    // Difference: 4.0 > 0.5 → 'up'
    expect(calculateTrend(responses, 'higher_is_better', 10)).toBe('up');
  });

  it('uses 5% of scale range as threshold', () => {
    // Scale range 1-10: 5% of 9 = 0.45
    const responses = [
      createMockResponse({ date: '2025-01-01', responses: { 'q1': { value: 5, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-02', responses: { 'q1': { value: 5, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-03', responses: { 'q1': { value: 5.4, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-04', responses: { 'q1': { value: 5.5, label: 'Q1' } } }),
    ];

    // First half: 5.0
    // Second half: 5.45
    // Difference: 0.45 ≈ threshold → should be 'up' just barely
    expect(calculateTrend(responses, 'higher_is_better', 10)).toBe('up');
  });

  it('handles different scale ranges correctly', () => {
    // Scale range 1-5: 5% of 4 = 0.2
    const responses = [
      createMockResponse({ date: '2025-01-01', responses: { 'q1': { value: 2, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-02', responses: { 'q1': { value: 2, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-03', responses: { 'q1': { value: 2.5, label: 'Q1' } } }),
      createMockResponse({ date: '2025-01-04', responses: { 'q1': { value: 2.5, label: 'Q1' } } }),
    ];

    // First half: 2.0
    // Second half: 2.5
    // Difference: 0.5 > 0.2 threshold → 'up'
    expect(calculateTrend(responses, 'higher_is_better', 5)).toBe('up');
  });
});

describe('groupResponsesByDate', () => {
  it('groups responses by date string', () => {
    const responses = [
      createMockResponse({ id: 'r1', date: '2025-01-15' }),
      createMockResponse({ id: 'r2', date: '2025-01-15' }),
      createMockResponse({ id: 'r3', date: '2025-01-16' }),
    ];

    const grouped = groupResponsesByDate(responses);

    expect(grouped.size).toBe(2);
    expect(grouped.get('2025-01-15')).toHaveLength(2);
    expect(grouped.get('2025-01-16')).toHaveLength(1);
    expect(grouped.get('2025-01-15')![0].id).toBe('r1');
  });

  it('returns empty map for empty array', () => {
    const grouped = groupResponsesByDate([]);
    expect(grouped.size).toBe(0);
  });

  it('maintains original response objects', () => {
    const responses = [createMockResponse({ id: 'test-response', userId: 'test-user' })];
    const grouped = groupResponsesByDate(responses);
    const groupedResponses = grouped.get('2025-01-15')!;

    expect(groupedResponses[0]).toBe(responses[0]); // Same reference
    expect(groupedResponses[0].id).toBe('test-response');
  });

  it('handles multiple responses on same date from different users', () => {
    const responses = [
      createMockResponse({ id: 'r1', userId: 'user-1', date: '2025-01-15' }),
      createMockResponse({ id: 'r2', userId: 'user-2', date: '2025-01-15' }),
      createMockResponse({ id: 'r3', userId: 'user-3', date: '2025-01-15' }),
    ];

    const grouped = groupResponsesByDate(responses);
    expect(grouped.get('2025-01-15')).toHaveLength(3);
  });
});

describe('filterResponsesByDateRange', () => {
  it('filters responses within date range (inclusive)', () => {
    const responses = [
      createMockResponse({ id: 'r1', date: '2025-01-10' }),
      createMockResponse({ id: 'r2', date: '2025-01-15' }),
      createMockResponse({ id: 'r3', date: '2025-01-20' }),
      createMockResponse({ id: 'r4', date: '2025-01-25' }),
    ];

    const filtered = filterResponsesByDateRange(responses, '2025-01-15', '2025-01-20');

    expect(filtered).toHaveLength(2);
    expect(filtered[0].id).toBe('r2');
    expect(filtered[1].id).toBe('r3');
  });

  it('includes boundary dates', () => {
    const responses = [
      createMockResponse({ id: 'r1', date: '2025-01-15' }),
      createMockResponse({ id: 'r2', date: '2025-01-16' }),
      createMockResponse({ id: 'r3', date: '2025-01-17' }),
    ];

    const filtered = filterResponsesByDateRange(responses, '2025-01-15', '2025-01-17');

    expect(filtered).toHaveLength(3);
  });

  it('sorts results by date ascending', () => {
    const responses = [
      createMockResponse({ id: 'r3', date: '2025-01-17' }),
      createMockResponse({ id: 'r1', date: '2025-01-15' }),
      createMockResponse({ id: 'r2', date: '2025-01-16' }),
    ];

    const filtered = filterResponsesByDateRange(responses, '2025-01-15', '2025-01-20');

    expect(filtered[0].id).toBe('r1');
    expect(filtered[1].id).toBe('r2');
    expect(filtered[2].id).toBe('r3');
  });

  it('returns empty array when no responses in range', () => {
    const responses = [
      createMockResponse({ date: '2025-01-10' }),
      createMockResponse({ date: '2025-01-11' }),
    ];

    const filtered = filterResponsesByDateRange(responses, '2025-01-15', '2025-01-20');
    expect(filtered).toHaveLength(0);
  });

  it('handles empty array', () => {
    const filtered = filterResponsesByDateRange([], '2025-01-15', '2025-01-20');
    expect(filtered).toHaveLength(0);
  });

  it('handles single-day range', () => {
    const responses = [
      createMockResponse({ id: 'r1', date: '2025-01-15' }),
      createMockResponse({ id: 'r2', date: '2025-01-15' }),
      createMockResponse({ id: 'r3', date: '2025-01-16' }),
    ];

    const filtered = filterResponsesByDateRange(responses, '2025-01-15', '2025-01-15');
    expect(filtered).toHaveLength(2);
  });
});

describe('aggregateStatusCounts', () => {
  it('counts responses by status (red, yellow, green)', () => {
    const template = createMockTemplate();
    const responses = [
      createMockResponse({ userId: 'user-1', responses: { 'q1': { value: 2, label: 'Q1' } } }), // red (≤ 3)
      createMockResponse({ userId: 'user-2', responses: { 'q1': { value: 5, label: 'Q1' } } }), // yellow (≤ 7)
      createMockResponse({ userId: 'user-3', responses: { 'q1': { value: 8, label: 'Q1' } } }), // green (> 7)
      createMockResponse({ userId: 'user-4', responses: { 'q1': { value: 9, label: 'Q1' } } }), // green
    ];

    const counts = aggregateStatusCounts(responses, template);

    expect(counts.red).toBe(1);
    expect(counts.yellow).toBe(1);
    expect(counts.green).toBe(2);
    expect(counts.total).toBe(4);
  });

  it('handles empty array', () => {
    const template = createMockTemplate();
    const counts = aggregateStatusCounts([], template);

    expect(counts.red).toBe(0);
    expect(counts.yellow).toBe(0);
    expect(counts.green).toBe(0);
    expect(counts.total).toBe(0);
  });

  it('uses calculateAthleteStatus for status determination', () => {
    const template = createMockTemplate({
      config: {
        questions: [
          {
            id: 'q1',
            type: 'scale',
            label: 'Q1',
            required: true,
            scaleMin: 1,
            scaleMax: 10,
          },
        ],
        statusConfig: {
          scaleOrientation: 'higher_is_better',
          calculationMethod: 'average',
          redThreshold: 3,
          yellowThreshold: 7,
          injuryQuestionIds: [],
          injuryOverride: true,
        },
      },
    });

    const responses = [
      createMockResponse({ responses: { 'q1': { value: 1, label: 'Q1' } } }),
    ];

    const counts = aggregateStatusCounts(responses, template);
    expect(counts.red).toBe(1);
  });

  it('respects lower_is_better orientation', () => {
    const template = createMockTemplate({
      config: {
        questions: [
          {
            id: 'q1',
            type: 'scale',
            label: 'Q1',
            required: true,
            scaleMin: 1,
            scaleMax: 10,
          },
        ],
        statusConfig: {
          scaleOrientation: 'lower_is_better',
          calculationMethod: 'average',
          redThreshold: 7,
          yellowThreshold: 4,
          injuryQuestionIds: [],
          injuryOverride: true,
        },
      },
    });

    const responses = [
      createMockResponse({ responses: { 'q1': { value: 2, label: 'Q1' } } }), // green (< 4)
      createMockResponse({ responses: { 'q1': { value: 5, label: 'Q1' } } }), // yellow (≥ 4, < 7)
      createMockResponse({ responses: { 'q1': { value: 8, label: 'Q1' } } }), // red (≥ 7)
    ];

    const counts = aggregateStatusCounts(responses, template);
    expect(counts.red).toBe(1);
    expect(counts.yellow).toBe(1);
    expect(counts.green).toBe(1);
  });
});

describe('groupResponsesByAthlete', () => {
  it('groups responses by userId', () => {
    const responses = [
      createMockResponse({ id: 'r1', userId: 'user-1', date: '2025-01-15' }),
      createMockResponse({ id: 'r2', userId: 'user-1', date: '2025-01-16' }),
      createMockResponse({ id: 'r3', userId: 'user-2', date: '2025-01-15' }),
    ];

    const grouped = groupResponsesByAthlete(responses);

    expect(grouped.size).toBe(2);
    expect(grouped.get('user-1')).toHaveLength(2);
    expect(grouped.get('user-2')).toHaveLength(1);
  });

  it('sorts each athlete\'s responses by date ascending', () => {
    const responses = [
      createMockResponse({ id: 'r1', userId: 'user-1', date: '2025-01-17' }),
      createMockResponse({ id: 'r2', userId: 'user-1', date: '2025-01-15' }),
      createMockResponse({ id: 'r3', userId: 'user-1', date: '2025-01-16' }),
    ];

    const grouped = groupResponsesByAthlete(responses);
    const userResponses = grouped.get('user-1')!;

    expect(userResponses[0].date).toBe('2025-01-15');
    expect(userResponses[1].date).toBe('2025-01-16');
    expect(userResponses[2].date).toBe('2025-01-17');
  });

  it('returns empty map for empty array', () => {
    const grouped = groupResponsesByAthlete([]);
    expect(grouped.size).toBe(0);
  });

  it('maintains original response objects', () => {
    const responses = [createMockResponse({ id: 'test-id', userId: 'user-1' })];
    const grouped = groupResponsesByAthlete(responses);
    const userResponses = grouped.get('user-1')!;

    expect(userResponses[0]).toBe(responses[0]);
  });

  it('handles single response per athlete', () => {
    const responses = [
      createMockResponse({ userId: 'user-1' }),
      createMockResponse({ userId: 'user-2' }),
      createMockResponse({ userId: 'user-3' }),
    ];

    const grouped = groupResponsesByAthlete(responses);

    expect(grouped.size).toBe(3);
    expect(grouped.get('user-1')).toHaveLength(1);
    expect(grouped.get('user-2')).toHaveLength(1);
    expect(grouped.get('user-3')).toHaveLength(1);
  });
});

describe('calculateAthleteStatus (re-export)', () => {
  it('is re-exported from wellness-status-utils', () => {
    const template = createMockTemplate();
    const response = createMockResponse({
      responses: { 'q1': { value: 8, label: 'Q1' } },
    });

    const status = calculateAthleteStatus(response, template);

    expect(status).toHaveProperty('status');
    expect(status).toHaveProperty('score');
    expect(status).toHaveProperty('injuries');
  });
});
