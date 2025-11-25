/**
 * Type Safety Tests for Wellness Analytics
 *
 * Tests validate:
 * - Type guards correctly identify valid objects
 * - Type guards reject invalid objects
 * - TypeScript enforces required fields at compile time
 * - Optional vs required fields are properly differentiated
 */

import { describe, it, expect } from 'vitest';
import type {
  WellnessTrendDataPoint,
  StatusCounts,
  TeamSummary,
  CompletionRate,
  QuestionAnalytics,
  ResponsesByTemplate,
  PaginatedResponses,
} from '../wellness-analytics-types';
import {
  isWellnessTrendDataPoint,
  isStatusCounts,
  isTeamSummary,
  isCompletionRate,
  isQuestionAnalytics,
} from '../wellness-analytics-types';

describe('wellness-analytics-types', () => {
  describe('WellnessTrendDataPoint', () => {
    it('should allow valid WellnessTrendDataPoint object', () => {
      const dataPoint: WellnessTrendDataPoint = {
        date: '2025-01-15',
        questionId: 'q1',
        avgValue: 7.5,
        responseCount: 10,
        stdDev: 1.2,
        minValue: 5,
        maxValue: 10,
      };

      expect(dataPoint.avgValue).toBe(7.5);
      expect(dataPoint.responseCount).toBe(10);
    });

    it('should allow null stdDev', () => {
      const dataPoint: WellnessTrendDataPoint = {
        date: '2025-01-15',
        questionId: 'q1',
        avgValue: 7.5,
        responseCount: 1,
        stdDev: null, // null when < 2 responses
        minValue: 7,
        maxValue: 7,
      };

      expect(dataPoint.stdDev).toBeNull();
    });

    it('should enforce required fields at compile time', () => {
      // @ts-expect-error - missing 'responseCount' field
      const invalid: WellnessTrendDataPoint = {
        date: '2025-01-15',
        questionId: 'q1',
        avgValue: 7.5,
        stdDev: null,
        minValue: 5,
        maxValue: 10,
      };
    });

    describe('isWellnessTrendDataPoint type guard', () => {
      it('should return true for valid data point', () => {
        const valid = {
          date: '2025-01-15',
          questionId: 'q1',
          avgValue: 7.5,
          responseCount: 10,
          stdDev: 1.2,
          minValue: 5,
          maxValue: 10,
        };

        expect(isWellnessTrendDataPoint(valid)).toBe(true);
      });

      it('should return true for valid data point with null stdDev', () => {
        const valid = {
          date: '2025-01-15',
          questionId: 'q1',
          avgValue: 7.5,
          responseCount: 1,
          stdDev: null,
          minValue: 7,
          maxValue: 7,
        };

        expect(isWellnessTrendDataPoint(valid)).toBe(true);
      });

      it('should return false for missing required field', () => {
        const invalid = {
          date: '2025-01-15',
          questionId: 'q1',
          avgValue: 7.5,
          // missing responseCount
          stdDev: null,
          minValue: 5,
          maxValue: 10,
        };

        expect(isWellnessTrendDataPoint(invalid)).toBe(false);
      });

      it('should return false for wrong type', () => {
        const invalid = {
          date: '2025-01-15',
          questionId: 'q1',
          avgValue: '7.5', // should be number
          responseCount: 10,
          stdDev: null,
          minValue: 5,
          maxValue: 10,
        };

        expect(isWellnessTrendDataPoint(invalid)).toBe(false);
      });

      it('should return false for null', () => {
        expect(isWellnessTrendDataPoint(null)).toBe(false);
      });

      it('should return false for undefined', () => {
        expect(isWellnessTrendDataPoint(undefined)).toBe(false);
      });
    });
  });

  describe('StatusCounts', () => {
    it('should allow valid StatusCounts object', () => {
      const counts: StatusCounts = {
        red: 5,
        yellow: 3,
        green: 12,
        total: 20,
      };

      expect(counts.total).toBe(20);
      expect(counts.red + counts.yellow + counts.green).toBe(20);
    });

    it('should enforce required fields', () => {
      // @ts-expect-error - missing 'total' field
      const invalid: StatusCounts = {
        red: 5,
        yellow: 3,
        green: 12,
      };
    });

    describe('isStatusCounts type guard', () => {
      it('should return true for valid counts', () => {
        const valid = {
          red: 5,
          yellow: 3,
          green: 12,
          total: 20,
        };

        expect(isStatusCounts(valid)).toBe(true);
      });

      it('should return false for missing field', () => {
        const invalid = {
          red: 5,
          yellow: 3,
          green: 12,
          // missing total
        };

        expect(isStatusCounts(invalid)).toBe(false);
      });

      it('should return false for wrong type', () => {
        const invalid = {
          red: '5', // should be number
          yellow: 3,
          green: 12,
          total: 20,
        };

        expect(isStatusCounts(invalid)).toBe(false);
      });
    });
  });

  describe('TeamSummary', () => {
    it('should allow valid TeamSummary object', () => {
      const summary: TeamSummary = {
        teamId: 'team-1',
        teamName: 'Varsity',
        averageWellness: 7.5,
        statusBreakdown: {
          red: 2,
          yellow: 5,
          green: 13,
          total: 20,
        },
        completionRate: 85.5,
        trend: 'up',
        lastUpdated: '2025-01-15T10:30:00Z',
      };

      expect(summary.averageWellness).toBe(7.5);
      expect(summary.completionRate).toBe(85.5);
    });

    it('should allow null averageWellness', () => {
      const summary: TeamSummary = {
        teamId: 'team-1',
        teamName: 'Varsity',
        averageWellness: null, // null when no responses
        statusBreakdown: {
          red: 0,
          yellow: 0,
          green: 0,
          total: 0,
        },
        completionRate: 0,
        trend: 'stable',
        lastUpdated: null,
      };

      expect(summary.averageWellness).toBeNull();
    });

    it('should enforce trend direction union type', () => {
      // @ts-expect-error - invalid trend direction
      const invalid: TeamSummary = {
        teamId: 'team-1',
        teamName: 'Varsity',
        averageWellness: 7.5,
        statusBreakdown: {
          red: 2,
          yellow: 5,
          green: 13,
          total: 20,
        },
        completionRate: 85.5,
        trend: 'sideways', // should be 'up' | 'down' | 'stable'
        lastUpdated: '2025-01-15T10:30:00Z',
      };
    });

    describe('isTeamSummary type guard', () => {
      it('should return true for valid summary', () => {
        const valid = {
          teamId: 'team-1',
          teamName: 'Varsity',
          averageWellness: 7.5,
          statusBreakdown: {
            red: 2,
            yellow: 5,
            green: 13,
            total: 20,
          },
          completionRate: 85.5,
          trend: 'up',
          lastUpdated: '2025-01-15T10:30:00Z',
        };

        expect(isTeamSummary(valid)).toBe(true);
      });

      it('should return false for invalid statusBreakdown', () => {
        const invalid = {
          teamId: 'team-1',
          teamName: 'Varsity',
          averageWellness: 7.5,
          statusBreakdown: {
            red: 2,
            yellow: 5,
            green: 13,
            // missing total
          },
          completionRate: 85.5,
          trend: 'up',
          lastUpdated: '2025-01-15T10:30:00Z',
        };

        expect(isTeamSummary(invalid)).toBe(false);
      });

      it('should return false for invalid trend', () => {
        const invalid = {
          teamId: 'team-1',
          teamName: 'Varsity',
          averageWellness: 7.5,
          statusBreakdown: {
            red: 2,
            yellow: 5,
            green: 13,
            total: 20,
          },
          completionRate: 85.5,
          trend: 'sideways', // invalid
          lastUpdated: '2025-01-15T10:30:00Z',
        };

        expect(isTeamSummary(invalid)).toBe(false);
      });
    });
  });

  describe('CompletionRate', () => {
    it('should allow valid CompletionRate object', () => {
      const rate: CompletionRate = {
        completed: 17,
        total: 20,
        percentage: 85,
      };

      expect(rate.percentage).toBe(85);
    });

    it('should allow zero completion', () => {
      const rate: CompletionRate = {
        completed: 0,
        total: 20,
        percentage: 0,
      };

      expect(rate.completed).toBe(0);
    });

    describe('isCompletionRate type guard', () => {
      it('should return true for valid rate', () => {
        const valid = {
          completed: 17,
          total: 20,
          percentage: 85,
        };

        expect(isCompletionRate(valid)).toBe(true);
      });

      it('should return false for missing field', () => {
        const invalid = {
          completed: 17,
          total: 20,
          // missing percentage
        };

        expect(isCompletionRate(invalid)).toBe(false);
      });
    });
  });

  describe('QuestionAnalytics', () => {
    it('should allow valid QuestionAnalytics object', () => {
      const analytics: QuestionAnalytics = {
        questionId: 'q1',
        questionLabel: 'How is your energy level?',
        questionType: 'scale',
        averageScore: 7.5,
        minScore: 3,
        maxScore: 10,
        stdDev: 1.8,
        responseCount: 25,
        trend: 'up',
      };

      expect(analytics.averageScore).toBe(7.5);
      expect(analytics.responseCount).toBe(25);
    });

    it('should allow null scores for non-numeric questions', () => {
      const analytics: QuestionAnalytics = {
        questionId: 'q2',
        questionLabel: 'Any injuries?',
        questionType: 'text',
        averageScore: null,
        minScore: null,
        maxScore: null,
        stdDev: null,
        responseCount: 25,
        trend: 'stable',
      };

      expect(analytics.averageScore).toBeNull();
    });

    describe('isQuestionAnalytics type guard', () => {
      it('should return true for valid analytics', () => {
        const valid = {
          questionId: 'q1',
          questionLabel: 'How is your energy level?',
          questionType: 'scale',
          averageScore: 7.5,
          minScore: 3,
          maxScore: 10,
          stdDev: 1.8,
          responseCount: 25,
          trend: 'up',
        };

        expect(isQuestionAnalytics(valid)).toBe(true);
      });

      it('should return true with null scores', () => {
        const valid = {
          questionId: 'q2',
          questionLabel: 'Any injuries?',
          questionType: 'text',
          averageScore: null,
          minScore: null,
          maxScore: null,
          stdDev: null,
          responseCount: 25,
          trend: 'stable',
        };

        expect(isQuestionAnalytics(valid)).toBe(true);
      });

      it('should return false for missing required field', () => {
        const invalid = {
          questionId: 'q1',
          questionLabel: 'How is your energy level?',
          questionType: 'scale',
          averageScore: 7.5,
          minScore: 3,
          maxScore: 10,
          stdDev: 1.8,
          // missing responseCount
          trend: 'up',
        };

        expect(isQuestionAnalytics(invalid)).toBe(false);
      });
    });
  });

  describe('PaginatedResponses', () => {
    it('should work with generic type parameter', () => {
      interface TestItem {
        id: string;
        name: string;
      }

      const paginated: PaginatedResponses<TestItem> = {
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' },
        ],
        total: 100,
        limit: 20,
        offset: 0,
        hasMore: true,
      };

      expect(paginated.data).toHaveLength(2);
      expect(paginated.data[0].name).toBe('Item 1');
      expect(paginated.hasMore).toBe(true);
    });

    it('should allow empty data array', () => {
      const paginated: PaginatedResponses<string> = {
        data: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
      };

      expect(paginated.data).toHaveLength(0);
      expect(paginated.hasMore).toBe(false);
    });
  });

  describe('ResponsesByTemplate', () => {
    it('should index by template ID', () => {
      const mockTemplate = {
        id: 'template-1',
        organizationId: 'org-1',
        name: 'Daily Wellness',
        isDefault: false,
        isActive: true,
        config: { questions: [] },
        createdBy: null,
        isSystemSeeded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockResponses = [
        {
          id: 'resp-1',
          requestId: null,
          organizationId: 'org-1',
          templateId: 'template-1',
          userId: 'user-1',
          userFullName: 'John Doe',
          teamId: null,
          teamNameSnapshot: null,
          submittedAt: new Date(),
          date: '2025-01-15',
          responses: {},
          accessMethod: null,
          ipAddress: null,
          userAgent: null,
          createdAt: new Date(),
        },
      ];

      const responsesByTemplate: ResponsesByTemplate = {
        'template-1': {
          template: mockTemplate,
          responses: mockResponses,
        },
      };

      expect(responsesByTemplate['template-1'].responses).toHaveLength(1);
      expect(responsesByTemplate['template-1'].template.name).toBe('Daily Wellness');
    });
  });

  describe('Type Compatibility', () => {
    it('should allow StatusCounts to be used in TeamSummary', () => {
      const counts: StatusCounts = {
        red: 5,
        yellow: 3,
        green: 12,
        total: 20,
      };

      const summary: TeamSummary = {
        teamId: 'team-1',
        teamName: 'Varsity',
        averageWellness: 7.5,
        statusBreakdown: counts, // StatusCounts type should be compatible
        completionRate: 85.5,
        trend: 'up',
        lastUpdated: '2025-01-15T10:30:00Z',
      };

      expect(summary.statusBreakdown).toBe(counts);
    });
  });
});
