/**
 * Wellness Questionnaire System - TypeScript Type Definitions
 *
 * Defines types for:
 * - Template configurations
 * - Question definitions
 * - Request distribution methods
 * - Response data structures
 * - Analytics aggregations
 */

import { z } from 'zod';

/**
 * Question Types
 */
export type QuestionType = 'scale' | 'text' | 'boolean' | 'body_map' | 'multiple_choice';

/**
 * Scale Question Configuration
 */
export interface ScaleQuestionConfig {
  id: string;
  type: 'scale';
  label: string;
  description?: string;
  scaleMin: number;
  scaleMax: number;
  minLabel?: string; // e.g., "Poor"
  maxLabel?: string; // e.g., "Excellent"
  required: boolean;
}

/**
 * Text Question Configuration
 */
export interface TextQuestionConfig {
  id: string;
  type: 'text';
  label: string;
  description?: string;
  placeholder?: string;
  maxLength?: number;
  required: boolean;
}

/**
 * Boolean (Yes/No) Question Configuration
 */
export interface BooleanQuestionConfig {
  id: string;
  type: 'boolean';
  label: string;
  description?: string;
  required: boolean;
}

/**
 * Body Map Question Configuration
 */
export interface BodyMapQuestionConfig {
  id: string;
  type: 'body_map';
  label: string;
  description?: string;
  allowMultiple: boolean; // Allow multiple pain points
  required: boolean;
}

/**
 * Multiple Choice Question Configuration
 */
export interface MultipleChoiceQuestionConfig {
  id: string;
  type: 'multiple_choice';
  label: string;
  description?: string;
  options: string[]; // Array of choice options (min 2, max 10)
  allowMultiple: boolean; // Single-select (false) vs multi-select (true)
  required: boolean;
}

/**
 * Union of all question types
 */
export type QuestionConfig =
  | ScaleQuestionConfig
  | TextQuestionConfig
  | BooleanQuestionConfig
  | BodyMapQuestionConfig
  | MultipleChoiceQuestionConfig;

/**
 * Color configuration for wellness analytics heatmap
 */
export interface WellnessColorConfig {
  lowThreshold: number;      // Scores at or below this are "low" (red/orange)
  mediumThreshold: number;   // Scores at or below this are "medium" (yellow)
  highThreshold: number;     // Scores above this are "high" (green)
}

/**
 * Scale orientation for status calculation
 * - higher_is_better: Higher scores = better health (e.g., 5 = excellent, 1 = poor)
 * - lower_is_better: Lower scores = better health (e.g., 1 = excellent, 5 = poor)
 */
export type ScaleOrientation = 'higher_is_better' | 'lower_is_better';

/**
 * Calculation method for wellness score
 * - average: Calculate average of all scale question responses (default, backward compatible)
 * - sum: Calculate sum of all scale question responses (Modified Hooper Index)
 */
export type CalculationMethod = 'average' | 'sum';

/**
 * Status configuration for wellness dashboard
 * Defines how athlete wellness scores map to red/yellow/green status
 */
export interface WellnessStatusConfig {
  scaleOrientation: ScaleOrientation;  // Determines how thresholds are interpreted
  calculationMethod?: CalculationMethod; // How to aggregate scale scores (default: 'average')
  redThreshold: number;                // For higher_is_better: scores <= this = red; for lower_is_better: scores >= this = red
  yellowThreshold: number;             // For higher_is_better: scores <= this = yellow; for lower_is_better: scores >= this = yellow
  injuryQuestionIds: string[];         // Question IDs that indicate injuries (typically body_map)
  injuryOverride: boolean;             // If true, any injury = red regardless of wellness score
}

/**
 * Wellness Template Configuration (stored as JSONB)
 */
export interface WellnessTemplateConfig {
  questions: QuestionConfig[];
  settings?: {
    allowAnonymous?: boolean;
    showProgressBar?: boolean;
    requireAllQuestions?: boolean;
    customThankYouMessage?: string;
  };
  colorConfig?: WellnessColorConfig; // Optional color thresholds for analytics heatmap
  statusConfig?: WellnessStatusConfig; // Optional status configuration for team dashboard
}

/**
 * Wellness Template (from database)
 */
export interface WellnessTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  isActive: boolean;
  config: WellnessTemplateConfig;
  createdBy: string | null;
  // Library fields
  category?: string | null;
  tags?: string[] | null;
  isSystemSeeded: boolean;
  sourceTemplateId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Distribution Methods for Wellness Requests
 */
export type DistributionMethod =
  | 'magic_link'      // Unauthenticated access via unique token
  | 'athlete_account' // Authenticated access via athlete login
  | 'team_link'       // Shared team link (optional auth)
  | 'qr_code';        // QR code scan (magic link in disguise)

/**
 * Request Status
 */
export type RequestStatus = 'active' | 'completed' | 'expired' | 'cancelled';

/**
 * Wellness Request (from database)
 */
export interface WellnessRequest {
  id: string;
  organizationId: string;
  templateId: string;
  requestedBy: string | null;
  distributionMethod: DistributionMethod;
  targetAthleteIds: string[] | null;
  targetTeamIds: string[] | null;
  publicToken: string | null;
  requiresAuth: boolean;
  scheduledFor: Date | null;
  expiresAt: Date | null;
  status: RequestStatus;
  createdAt: Date;
}

/**
 * Response value for different question types
 */
export type ResponseValue =
  | number                // Scale question
  | string                // Text question or single-select multiple choice
  | boolean               // Boolean question
  | string[]              // Multi-select multiple choice
  | { x: number; y: number; label?: string }[]; // Body map (array of coordinates)

/**
 * Individual question response
 */
export interface QuestionResponse {
  questionId: string;
  value: ResponseValue;
  answeredAt?: string; // ISO timestamp
}

/**
 * Wellness Response Data (stored as JSONB)
 */
export interface WellnessResponseData {
  [questionId: string]: {
    value: ResponseValue;
    label: string; // Question label at time of submission
  };
}

/**
 * Wellness Response (from database)
 */
export interface WellnessResponse {
  id: string;
  requestId: string | null;
  organizationId: string; // Historical reference (no FK)
  templateId: string;     // Historical reference (no FK)
  userId: string;         // Historical reference (no FK)
  userFullName: string;   // Snapshot at submission
  teamId: string | null;  // Historical reference (no FK)
  teamNameSnapshot: string | null;
  submittedAt: Date;
  date: string; // YYYY-MM-DD format
  responses: WellnessResponseData;
  accessMethod: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Analytics - Team Summary
 */
export interface WellnessTeamSummary {
  teamId: string;
  teamName: string;
  totalResponses: number;
  uniqueAthletes: number;
  completionRate: number; // Percentage
  averageScores: {
    [questionId: string]: number;
  };
  lastUpdated: Date;
}

/**
 * Analytics - Individual Athlete Summary
 */
export interface WellnessAthleteSummary {
  userId: string;
  userFullName: string;
  totalResponses: number;
  latestResponse: Date | null;
  averageScores: {
    [questionId: string]: number;
  };
  trends: {
    [questionId: string]: 'improving' | 'declining' | 'stable';
  };
}

/**
 * Analytics - Trend Data Point
 */
export interface WellnessTrendDataPoint {
  date: string; // YYYY-MM-DD
  value: number;
  count: number; // Number of responses on this date
}

/**
 * Analytics - Question Trend
 */
export interface WellnessTrend {
  questionId: string;
  questionLabel: string;
  dataPoints: WellnessTrendDataPoint[];
  trend: 'improving' | 'declining' | 'stable';
  trendPercentage: number; // % change over time period
}

/**
 * Analytics - Alert Types
 */
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertType = 'wellness_drop' | 'sustained_low';
export type TrendDirection = 'up' | 'down' | 'stable';

export interface WellnessAlert {
  id: string;
  athleteId: string;
  athleteName: string;
  questionId: string;
  questionLabel: string;
  severity: AlertSeverity;
  type: AlertType;
  message: string;
  value: ResponseValue;
  threshold: number;
  date: string; // YYYY-MM-DD
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
}

/**
 * Analytics - Wellness Analytics Response
 */
export interface WellnessAnalytics {
  organizationId: string;
  dateRange: {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
  };
  summary: {
    totalResponses: number;
    uniqueAthletes: number;
    completionRate: number;
    activeAlerts: number;
  };
  teamSummaries: WellnessTeamSummary[];
  athleteSummaries: WellnessAthleteSummary[];
  trends: WellnessTrend[];
  alerts: WellnessAlert[];
}

/**
 * Wellness Heatmap Data (for team wellness grid visualization)
 */
export interface WellnessHeatmapCell {
  athleteId: string;
  athleteName: string;
  questionId: string;
  value: number | null;
  date: string; // YYYY-MM-DD
  severity: AlertSeverity | null;
}

export interface WellnessHeatmap {
  rows: string[]; // Athlete IDs
  columns: string[]; // Question IDs
  data: WellnessHeatmapCell[][];
  lastUpdated: Date;
}

/**
 * Analytics Dashboard - Summary Card Data
 */
export interface WellnessSummary {
  averageWellness: number;
  trend: TrendDirection;
  totalResponses: number;
  uniqueAthletes: number;
  lastUpdated: Date;
}

/**
 * Analytics Dashboard - Filters
 */
export interface WellnessFilters {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  teamIds: string[];
  athleteIds: string[];
}

/**
 * Analytics Dashboard - Completion Rate Data
 */
export interface CompletionRateData {
  percentage: number;
  completed: number;
  total: number;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
}

/**
 * Analytics Dashboard - Heatmap Cell Data (for UI components)
 */
export interface HeatmapCellData {
  athleteId: string;
  athleteName: string;
  date: string; // YYYY-MM-DD
  score: number | null;
  responses: WellnessResponseData;
  hasAlert: boolean;
  alertSeverity?: AlertSeverity;
}

/**
 * Correlation Data (wellness vs performance metrics)
 */
export interface WellnessCorrelation {
  questionId: string;
  questionLabel: string;
  metricCode: string;
  metricLabel: string;
  correlationCoefficient: number; // -1 to 1
  sampleSize: number;
  pValue: number; // Statistical significance
  dataPoints: {
    wellnessScore: number;
    metricValue: number;
    date: string;
  }[];
}

/**
 * Request Creation Payload
 */
export interface CreateWellnessRequest {
  templateId: string;
  distributionMethod: DistributionMethod;
  targetAthleteIds?: string[];
  targetTeamIds?: string[];
  requiresAuth?: boolean;
  scheduledFor?: Date | string;
  expiresAt?: Date | string;
}

/**
 * Template Creation Payload
 */
export interface CreateWellnessTemplate {
  name: string;
  description?: string;
  config: WellnessTemplateConfig;
  isDefault?: boolean;
  isActive?: boolean;
  // Library fields
  category?: string;
  tags?: string[];
  isSystemSeeded?: boolean;
  sourceTemplateId?: string;
}

/**
 * Response Submission Payload
 */
export interface SubmitWellnessResponse {
  requestId?: string;
  templateId: string;
  date: string; // YYYY-MM-DD
  responses: WellnessResponseData;
  accessMethod?: string;
}
