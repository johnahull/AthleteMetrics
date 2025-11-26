/**
 * Wellness Analytics - Strongly Typed Definitions
 *
 * Eliminates `any` types by providing explicit type definitions for:
 * - Trend data from SQL aggregation
 * - Status aggregation counts
 * - Team and athlete summaries
 * - Paginated responses
 * - Question-level analytics
 *
 * These types ensure type safety across the wellness feature stack:
 * - API responses
 * - React Query hooks
 * - Calculation utilities
 * - Storage layer
 */

import type { WellnessResponse, WellnessTemplate, TrendDirection } from './wellness-types';

/**
 * Trend data point from SQL aggregation
 * Represents aggregated wellness metrics for a specific date and question
 */
export interface WellnessTrendDataPoint {
  date: string;              // YYYY-MM-DD format
  questionId: string;        // Question identifier from template
  avgValue: number;          // Average response value for this date
  responseCount: number;     // Number of responses on this date
  stdDev: number | null;     // Standard deviation (null if < 2 responses)
  minValue: number;          // Minimum response value
  maxValue: number;          // Maximum response value
}

/**
 * Status aggregation counts
 * Tallies how many athletes fall into each wellness status category
 */
export interface StatusCounts {
  red: number;      // Critical - needs immediate attention
  yellow: number;   // Warning - monitor closely
  green: number;    // Healthy - no concerns
  total: number;    // Sum of all statuses
}

/**
 * Team summary for analytics dashboard
 * Aggregated wellness metrics for an entire team
 */
export interface TeamSummary {
  teamId: string;
  teamName: string;
  averageWellness: number | null;       // Average wellness score (null if no responses)
  statusBreakdown: StatusCounts;        // Count of red/yellow/green athletes
  completionRate: number;               // Percentage (0-100) of athletes who responded
  trend: TrendDirection;                // 'up' (improving), 'down' (declining), 'stable'
  lastUpdated: string | null;           // ISO timestamp of most recent response
}

/**
 * Overall wellness summary across organization/team/athlete
 * Used for summary cards and dashboard overviews
 */
export interface WellnessSummary {
  averageWellness: number | null;       // Mean wellness score
  trend: TrendDirection;                // Trend direction over time period
  totalResponses: number;               // Total number of responses
  uniqueAthletes: number;               // Count of unique athletes who responded
  lastUpdated: Date | null;             // Most recent response timestamp
}

/**
 * Completion rate statistics
 * Tracks how many athletes completed wellness questionnaires
 */
export interface CompletionRate {
  completed: number;    // Number of athletes who submitted responses
  total: number;        // Total number of athletes targeted
  percentage: number;   // Completion percentage (0-100)
}

/**
 * Generic paginated response wrapper
 * Provides pagination metadata alongside data results
 */
export interface PaginatedResponses<T> {
  data: T[];           // Array of items for current page
  total: number;       // Total count across all pages
  limit: number;       // Items per page
  offset: number;      // Offset from start (page * limit)
  hasMore: boolean;    // Whether there are more pages available
}

/**
 * Responses grouped by template
 * Organizes responses by which template they belong to
 */
export interface ResponsesByTemplate {
  [templateId: string]: {
    template: WellnessTemplate;
    responses: WellnessResponse[];
  };
}

/**
 * Question-level analytics
 * Detailed metrics for individual questionnaire questions
 */
export interface QuestionAnalytics {
  questionId: string;           // Question identifier
  questionLabel: string;        // Question text
  questionType: string;         // Question type (scale, text, boolean, etc.)
  averageScore: number | null;  // Mean score (null for non-numeric questions)
  minScore: number | null;      // Minimum score observed
  maxScore: number | null;      // Maximum score observed
  stdDev: number | null;        // Standard deviation (null if < 2 responses)
  responseCount: number;        // Total number of responses
  trend: TrendDirection;        // Trend over time period
}

// ==================== Type Guards ====================

/**
 * Type guard to validate WellnessTrendDataPoint at runtime
 * Useful for API response validation and defensive programming
 */
export function isWellnessTrendDataPoint(obj: unknown): obj is WellnessTrendDataPoint {
  if (typeof obj !== 'object' || obj === null) return false;
  const data = obj as any;
  return (
    typeof data.date === 'string' &&
    typeof data.questionId === 'string' &&
    typeof data.avgValue === 'number' &&
    typeof data.responseCount === 'number' &&
    (data.stdDev === null || typeof data.stdDev === 'number') &&
    typeof data.minValue === 'number' &&
    typeof data.maxValue === 'number'
  );
}

/**
 * Type guard to validate StatusCounts at runtime
 */
export function isStatusCounts(obj: unknown): obj is StatusCounts {
  if (typeof obj !== 'object' || obj === null) return false;
  const counts = obj as any;
  return (
    typeof counts.red === 'number' &&
    typeof counts.yellow === 'number' &&
    typeof counts.green === 'number' &&
    typeof counts.total === 'number'
  );
}

/**
 * Type guard to validate TeamSummary at runtime
 */
export function isTeamSummary(obj: unknown): obj is TeamSummary {
  if (typeof obj !== 'object' || obj === null) return false;
  const summary = obj as any;
  return (
    typeof summary.teamId === 'string' &&
    typeof summary.teamName === 'string' &&
    (summary.averageWellness === null || typeof summary.averageWellness === 'number') &&
    isStatusCounts(summary.statusBreakdown) &&
    typeof summary.completionRate === 'number' &&
    ['up', 'down', 'stable'].includes(summary.trend) &&
    (summary.lastUpdated === null || typeof summary.lastUpdated === 'string')
  );
}

/**
 * Type guard to validate CompletionRate at runtime
 */
export function isCompletionRate(obj: unknown): obj is CompletionRate {
  if (typeof obj !== 'object' || obj === null) return false;
  const rate = obj as any;
  return (
    typeof rate.completed === 'number' &&
    typeof rate.total === 'number' &&
    typeof rate.percentage === 'number'
  );
}

/**
 * Type guard to validate QuestionAnalytics at runtime
 */
export function isQuestionAnalytics(obj: unknown): obj is QuestionAnalytics {
  if (typeof obj !== 'object' || obj === null) return false;
  const analytics = obj as any;
  return (
    typeof analytics.questionId === 'string' &&
    typeof analytics.questionLabel === 'string' &&
    typeof analytics.questionType === 'string' &&
    (analytics.averageScore === null || typeof analytics.averageScore === 'number') &&
    (analytics.minScore === null || typeof analytics.minScore === 'number') &&
    (analytics.maxScore === null || typeof analytics.maxScore === 'number') &&
    (analytics.stdDev === null || typeof analytics.stdDev === 'number') &&
    typeof analytics.responseCount === 'number' &&
    ['up', 'down', 'stable'].includes(analytics.trend)
  );
}
