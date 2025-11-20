/**
 * Organization Type TypeScript Definitions
 * 
 * @fileoverview Comprehensive type definitions for organization types including:
 * - Strict type definitions with branded types for additional safety
 * - API request/response types with proper validation
 * - Database query result types with null safety
 * - Generic utility types for type-safe operations
 * 
 * @author AthleteMetrics System  
 * @version 1.0.0
 * @since 2025-11-09
 */

import { z } from 'zod';
import { organizationTypeEnum } from './schema';

/**
 * Base organization type from schema enum
 */
export type OrganizationType = (typeof organizationTypeEnum)[number];

/**
 * Branded type for validated organization types
 * Provides additional compile-time safety to ensure types have been validated
 */
export type ValidatedOrganizationType = OrganizationType & { readonly __validated: true };

/**
 * Union type for organization type with null/undefined handling
 */
export type OrganizationTypeNullable = OrganizationType | null | undefined;

/**
 * Array type for multiple organization types with length constraints
 */
export type OrganizationTypeArray = readonly OrganizationType[];

/**
 * Organization type with metadata for UI display
 */
export interface OrganizationTypeWithMetadata {
  readonly value: OrganizationType;
  readonly label: string;
  readonly description: string;
  readonly color: string;
  readonly icon?: string;
  readonly displayOrder: number;
}

/**
 * Organization type validation result
 */
export interface OrganizationTypeValidationResult {
  readonly valid: boolean;
  readonly value: OrganizationType | null;
  readonly error?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Bulk validation result for organization types
 */
export interface BulkOrganizationTypeValidationResult<T extends Record<string, any>> {
  readonly results: Array<{
    readonly index: number;
    readonly original: unknown;
    readonly valid: boolean;
    readonly normalized?: T;
    readonly error?: string;
  }>;
  readonly summary: {
    readonly total: number;
    readonly valid: number;
    readonly invalid: number;
    readonly validationRate: number;
  };
}

/**
 * Organization type filter configuration
 */
export interface OrganizationTypeFilter {
  readonly include?: readonly OrganizationType[];
  readonly exclude?: readonly OrganizationType[];
  readonly required?: boolean;
  readonly multiple?: boolean;
}

/**
 * Organization type statistics for admin dashboard
 */
export interface OrganizationTypeStatistics extends Record<OrganizationType, number> {
  readonly total: number;
  readonly lastUpdated: string;
}

/**
 * Organization type breakdown with percentages
 */
export interface OrganizationTypeBreakdown {
  readonly organizationType: OrganizationType;
  readonly organizationTypeLabel: string;
  readonly count: number;
  readonly percentage: number;
  readonly trend?: 'up' | 'down' | 'stable';
}

/**
 * Performance metrics for organization type operations
 */
export interface OrganizationTypePerformanceMetrics {
  readonly queriesExecuted: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly averageQueryTime: number;
  readonly lastResetTime: string;
  readonly cacheHitRate: number;
}

/**
 * API Request Types
 */

/**
 * Request to get metrics filtered by organization type
 */
export interface GetMetricsByOrganizationTypeRequest {
  readonly organizationType: OrganizationType;
  readonly useCache?: boolean;
  readonly includeInactive?: boolean;
}

/**
 * Request to get benchmarks filtered by organization type
 */
export interface GetBenchmarksByOrganizationTypeRequest {
  readonly organizationType: OrganizationType;
  readonly useCache?: boolean;
  readonly includeInactive?: boolean;
  readonly filters?: {
    readonly gender?: 'Male' | 'Female' | 'Not Specified';
    readonly ageMin?: number;
    readonly ageMax?: number;
    readonly level?: string;
    readonly position?: string;
  };
}

/**
 * Request to filter metrics by multiple organization types
 */
export interface FilterMetricsByOrganizationTypesRequest {
  readonly organizationTypes: readonly OrganizationType[];
  readonly combineResults?: boolean;
  readonly deduplicateMetrics?: boolean;
}

/**
 * Request to validate organization types
 */
export interface ValidateOrganizationTypesRequest {
  readonly values: readonly unknown[];
  readonly field?: string;
  readonly strict?: boolean;
}

/**
 * Request to get organizations by type
 */
export interface GetOrganizationsByTypeRequest {
  readonly organizationType?: OrganizationType;
  readonly includeInactive?: boolean;
  readonly limit?: number;
  readonly offset?: number;
  readonly search?: string;
}

/**
 * API Response Types
 */

/**
 * Response with organization type metadata
 */
export interface OrganizationTypeMetadataResponse {
  readonly organizationType: OrganizationType;
  readonly organizationTypeLabel: string;
  readonly organizationTypeDescription?: string;
  readonly organizationTypeColor?: string;
}

/**
 * Response for metrics filtered by organization type
 */
export interface MetricsByOrganizationTypeResponse extends OrganizationTypeMetadataResponse {
  readonly metrics: readonly unknown[]; // Replace with actual Metric type
  readonly count: number;
  readonly cached: boolean;
  readonly timestamp: string;
}

/**
 * Response for benchmarks filtered by organization type
 */
export interface BenchmarksByOrganizationTypeResponse extends OrganizationTypeMetadataResponse {
  readonly benchmarks: readonly unknown[]; // Replace with actual Benchmark type
  readonly count: number;
  readonly cached: boolean;
  readonly timestamp: string;
}

/**
 * Response for bulk metrics filtering
 */
export interface BulkMetricsFilterResponse {
  readonly organizationTypes: readonly OrganizationType[];
  readonly resultsByOrgType: Record<OrganizationType, readonly unknown[]>;
  readonly combinedMetrics?: readonly unknown[];
  readonly totalUniqueMetrics: number;
  readonly timestamp: string;
}

/**
 * Response for organization type statistics
 */
export interface OrganizationTypeStatisticsResponse {
  readonly total: number;
  readonly breakdown: readonly OrganizationTypeBreakdown[];
  readonly timestamp: string;
  readonly trends?: Record<OrganizationType, 'up' | 'down' | 'stable'>;
}

/**
 * Response for organization type validation
 */
export interface OrganizationTypeValidationResponse<T extends Record<string, any> = Record<string, any>> 
  extends BulkOrganizationTypeValidationResult<T> {
  readonly timestamp: string;
}

/**
 * Response for performance metrics
 */
export interface OrganizationTypePerformanceResponse {
  readonly performance: OrganizationTypePerformanceMetrics;
  readonly health: {
    readonly status: 'healthy' | 'degraded' | 'unhealthy';
    readonly cacheSize: number;
    readonly lastError?: string;
  };
  readonly timestamp: string;
}

/**
 * Database Query Result Types
 */

/**
 * Database result for organization with type
 */
export interface OrganizationWithType {
  readonly id: string;
  readonly name: string;
  readonly orgType: OrganizationType;
  readonly isActive: boolean;
  readonly description?: string;
  readonly location?: string;
  readonly createdAt: string;
}

/**
 * Database result for metric with organization type filtering
 */
export interface MetricWithOrganizationType {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly availableOrgTypes?: readonly OrganizationType[] | null;
  readonly isActive: boolean;
  readonly category?: string;
  readonly unit?: string;
}

/**
 * Database result for benchmark with organization type filtering
 */
export interface BenchmarkWithOrganizationType {
  readonly id: string;
  readonly metricCode: string;
  readonly name: string;
  readonly applicableOrgTypes?: readonly OrganizationType[] | null;
  readonly isActive: boolean;
  readonly benchmarkValue: number;
  readonly comparisonOperator: 'lte' | 'gte' | 'eq';
}

/**
 * Utility Types
 */

/**
 * Extract organization types from a union type
 */
export type ExtractOrganizationType<T> = T extends { orgType: infer U } 
  ? U extends OrganizationType 
    ? U 
    : never 
  : never;

/**
 * Make organization type fields optional
 */
export type WithOptionalOrganizationType<T extends { orgType: OrganizationType }> = 
  Omit<T, 'orgType'> & { orgType?: OrganizationType };

/**
 * Make organization type fields required
 */
export type WithRequiredOrganizationType<T extends { orgType?: OrganizationType }> = 
  Omit<T, 'orgType'> & { orgType: OrganizationType };

/**
 * Filter type to only include items with matching organization type
 */
export type FilterByOrganizationType<T extends { orgType: OrganizationType }, K extends OrganizationType> = 
  T extends { orgType: K } ? T : never;

/**
 * Map organization type to its label
 */
export type OrganizationTypeToLabel<T extends OrganizationType> = T extends 'youth' 
  ? 'Youth/Recreational'
  : T extends 'high_school'
  ? 'High School'
  : T extends 'college'
  ? 'College/University'
  : T extends 'club'
  ? 'Club/Travel Team'
  : T extends 'private_facility'
  ? 'Private Training Facility'
  : T extends 'elite_academy'
  ? 'Elite Academy'
  : string;

/**
 * Type guard function type
 */
export type OrganizationTypeGuard<T extends OrganizationType = OrganizationType> = 
  (value: unknown) => value is T;

/**
 * Parser function type
 */
export type OrganizationTypeParser<T extends OrganizationType = OrganizationType> = 
  (value: unknown, fallback?: T) => T;

/**
 * Validator function type
 */
export type OrganizationTypeValidator<T extends Record<string, any> = Record<string, any>> = 
  (data: T[], field?: keyof T) => T[];

/**
 * Cache key generator type
 */
export type OrganizationTypeCacheKey = 
  | `metrics:${OrganizationType}`
  | `benchmarks:${OrganizationType}`
  | `orgs:${OrganizationType | 'all'}:${boolean}`;

/**
 * Event types for organization type changes
 */
export interface OrganizationTypeChangeEvent {
  readonly type: 'organization_type_changed';
  readonly organizationId: string;
  readonly oldType: OrganizationType | null;
  readonly newType: OrganizationType;
  readonly timestamp: string;
  readonly userId: string;
}

/**
 * Configuration types for organization type operations
 */
export interface OrganizationTypeConfig {
  readonly cache: {
    readonly ttl: number;
    readonly maxSize: number;
    readonly enabled: boolean;
  };
  readonly validation: {
    readonly strict: boolean;
    readonly allowEmpty: boolean;
    readonly defaultType: OrganizationType;
  };
  readonly performance: {
    readonly enableMetrics: boolean;
    readonly slowQueryThreshold: number;
    readonly cacheHitRateThreshold: number;
  };
}

/**
 * Context type for organization type operations
 */
export interface OrganizationTypeContext {
  readonly userId: string;
  readonly userRole: string;
  readonly isSiteAdmin: boolean;
  readonly timestamp: string;
  readonly source: 'api' | 'ui' | 'batch' | 'system';
  readonly requestId?: string;
}

/**
 * Zod schema types for runtime validation
 */
export type OrganizationTypeSchema = z.ZodEnum<[OrganizationType, ...OrganizationType[]]>;
export type OrganizationTypeArraySchema = z.ZodArray<OrganizationTypeSchema>;
export type OptionalOrganizationTypeSchema = z.ZodOptional<OrganizationTypeSchema>;

/**
 * Error types specific to organization types
 */
export interface OrganizationTypeError {
  readonly type: 'INVALID_ORG_TYPE' | 'UNAUTHORIZED_TYPE_ACCESS' | 'TYPE_VALIDATION_FAILED' | 'TYPE_FILTERING_ERROR';
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly organizationType?: OrganizationType;
  readonly timestamp: string;
}

/**
 * Audit log entry for organization type operations
 */
export interface OrganizationTypeAuditLog {
  readonly id: string;
  readonly userId: string;
  readonly action: string;
  readonly organizationType: OrganizationType;
  readonly resourceType: 'metrics' | 'benchmarks' | 'organizations' | 'statistics';
  readonly resourceId?: string;
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
  readonly timestamp: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

/**
 * Export all organization types as a const assertion for better intellisense
 */
export const ORGANIZATION_TYPES = organizationTypeEnum as readonly OrganizationType[];

/**
 * Type-safe organization type checks
 */
export type IsValidOrganizationType<T> = T extends OrganizationType ? true : false;

/**
 * Conditional types for organization type operations
 */
export type IfOrganizationType<T, Then, Else = never> = 
  T extends OrganizationType ? Then : Else;

/**
 * Readonly deep organization type wrapper
 */
export type ReadonlyOrganizationType<T> = {
  readonly [K in keyof T]: T[K] extends OrganizationType[] 
    ? readonly OrganizationType[]
    : T[K] extends OrganizationType
    ? OrganizationType
    : T[K] extends object
    ? ReadonlyOrganizationType<T[K]>
    : T[K];
};

/**
 * Brand organization type for additional type safety
 */
export function brandOrganizationType(value: OrganizationType): ValidatedOrganizationType {
  return value as ValidatedOrganizationType;
}

/**
 * Type assertion helpers
 */
export declare function assertOrganizationType(value: unknown): asserts value is OrganizationType;
export declare function assertValidatedOrganizationType(value: unknown): asserts value is ValidatedOrganizationType;