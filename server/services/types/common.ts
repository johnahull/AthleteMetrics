/**
 * Common Service Type Definitions
 *
 * Shared type definitions used across multiple services
 */

// Measurement Filters (based on storage.ts getMeasurements method)
export interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  teamIds?: string[];
  organizationId?: string;
  metric?: string;
  dateFrom?: string;
  dateTo?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  ageFrom?: number;
  ageTo?: number;
  search?: string;
  sport?: string;
  gender?: string;
  position?: string;
  includeUnverified?: boolean;
}

// Analytics Request (for chart recommendations)
export interface AnalyticsRequest {
  filters: MeasurementFilters;
  chartType?: ChartType;
  analysisType?: 'individual' | 'intra_group' | 'inter_group';
  metrics?: string[];
  groupBy?: string[];
}

// Analytics Response
export interface AnalyticsResponse {
  data: any[];
  statistics: StatisticalSummary;
  groupings?: Record<string, any>;
  meta: {
    totalRecords: number;
    filters: MeasurementFilters;
    generatedAt: string;
  };
}

// Chart Recommendation
export interface ChartRecommendation {
  type: ChartType;
  confidence: number;
  reasoning: string;
  alternatives: ChartType[];
}

// Chart Types
export type ChartType =
  | 'boxplot'
  | 'scatter'
  | 'line'
  | 'radar'
  | 'distribution'
  | 'bar'
  | 'area';

// Statistical Summary
export interface StatisticalSummary {
  count: number;
  mean?: number;
  median?: number;
  std?: number;
  min?: number;
  max?: number;
  q1?: number;
  q3?: number;
  range?: number;
}

// Session and Authentication Types
export interface SessionData {
  sessionId: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordResetToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
}

export interface UserLockout {
  userId: string;
  failedAttempts: number;
  firstFailedAt: Date;
  lastFailedAt: Date;
  lockedUntil?: Date;
}

// Fix for User types to ensure id is always string
export interface SafeUser {
  id: string;
  username: string;
  emails: string[];
  firstName: string;
  lastName: string;
  fullName: string;
  role?: string;
  isSiteAdmin?: boolean | string;
  isActive?: string;
  [key: string]: any;
}

// User conversion utility function type
export type UserWithRequiredId = Omit<import('@shared/schema').User, 'id'> & { id: string };