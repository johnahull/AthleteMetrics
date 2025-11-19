/**
 * Organization Type Utilities
 * Centralized utilities for organization type handling across the application
 * 
 * @fileoverview Provides type-safe utilities for organization type operations including:
 * - Type validation and parsing
 * - Human-readable labels and descriptions
 * - Filtering and querying utilities
 * - Performance-optimized helpers
 * 
 * @author AthleteMetrics System
 * @version 1.0.0
 * @since 2025-11-09
 */

import { z } from 'zod';
import { organizationTypeEnum } from './schema';

/**
 * Organization type union type derived from schema enum
 */
export type OrganizationType = (typeof organizationTypeEnum)[number];

/**
 * Human-readable labels for organization types
 * Used consistently across UI components for display purposes
 */
export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  youth: 'Youth/Recreational',
  high_school: 'High School',
  college: 'College/University',
  club: 'Club/Travel Team',
  private_facility: 'Private Training Facility',
  elite_academy: 'Elite Academy',
} as const;

/**
 * Detailed descriptions for organization types
 * Used for tooltips, help text, and onboarding content
 */
export const ORGANIZATION_TYPE_DESCRIPTIONS: Record<OrganizationType, string> = {
  youth: 'Youth recreational programs and beginner-level sports organizations',
  high_school: 'High school teams, including varsity, JV, and freshman levels',
  college: 'College and university teams, including NCAA divisions and club sports',
  club: 'Club teams, travel teams, and competitive recreational organizations',
  private_facility: 'Private training facilities and coaches (All ages)',
  elite_academy: 'Elite sports academies and professional development programs',
} as const;

/**
 * Organization type priority order for sorting/display
 * Ordered from most common to most specialized
 */
export const ORGANIZATION_TYPE_DISPLAY_ORDER: OrganizationType[] = [
  'club',
  'high_school',
  'college',
  'youth',
  'private_facility',
  'elite_academy',
] as const;

/**
 * CSS color classes for organization type badges
 * Consistent color scheme across the application
 */
export const ORGANIZATION_TYPE_COLORS: Record<OrganizationType, string> = {
  youth: 'bg-green-100 text-green-800',
  high_school: 'bg-blue-100 text-blue-800',
  college: 'bg-purple-100 text-purple-800',
  club: 'bg-orange-100 text-orange-800',
  private_facility: 'bg-gray-100 text-gray-800',
  elite_academy: 'bg-red-100 text-red-800',
} as const;

/**
 * Type guard to check if a value is a valid organization type
 * 
 * @param value - The value to check
 * @returns True if the value is a valid organization type
 * 
 * @example
 * ```typescript
 * if (isValidOrganizationType(userInput)) {
 *   // TypeScript now knows userInput is OrganizationType
 *   console.log(ORGANIZATION_TYPE_LABELS[userInput]);
 * }
 * ```
 */
export function isValidOrganizationType(value: unknown): value is OrganizationType {
  return typeof value === 'string' && organizationTypeEnum.includes(value as OrganizationType);
}

/**
 * Safely parse and validate an organization type value
 * 
 * @param value - The value to parse
 * @param fallback - The fallback value if parsing fails (defaults to 'club')
 * @returns A valid organization type
 * 
 * @example
 * ```typescript
 * const orgType = parseOrganizationType(userInput);
 * // Always returns a valid OrganizationType
 * ```
 */
export function parseOrganizationType(
  value: unknown, 
  fallback: OrganizationType = 'club'
): OrganizationType {
  if (isValidOrganizationType(value)) {
    return value;
  }
  return fallback;
}

/**
 * Get human-readable label for organization type with fallback
 * 
 * @param orgType - The organization type
 * @param fallback - The fallback label (defaults to 'Unknown')
 * @returns Human-readable label
 * 
 * @example
 * ```typescript
 * const label = getOrganizationTypeLabel('college');
 * // Returns: "College/University"
 * ```
 */
export function getOrganizationTypeLabel(
  orgType: OrganizationType | null | undefined,
  fallback: string = 'Unknown'
): string {
  if (!orgType || !isValidOrganizationType(orgType)) {
    return fallback;
  }
  return ORGANIZATION_TYPE_LABELS[orgType];
}

/**
 * Get description for organization type with fallback
 * 
 * @param orgType - The organization type
 * @param fallback - The fallback description (defaults to 'No description available')
 * @returns Description text
 */
export function getOrganizationTypeDescription(
  orgType: OrganizationType | null | undefined,
  fallback: string = 'No description available'
): string {
  if (!orgType || !isValidOrganizationType(orgType)) {
    return fallback;
  }
  return ORGANIZATION_TYPE_DESCRIPTIONS[orgType];
}

/**
 * Get CSS color classes for organization type badge
 * 
 * @param orgType - The organization type
 * @param fallback - The fallback color classes (defaults to gray)
 * @returns CSS color classes
 */
export function getOrganizationTypeColors(
  orgType: OrganizationType | null | undefined,
  fallback: string = 'bg-gray-100 text-gray-800'
): string {
  if (!orgType || !isValidOrganizationType(orgType)) {
    return fallback;
  }
  return ORGANIZATION_TYPE_COLORS[orgType];
}

/**
 * Filter organization types for select options
 * 
 * @param includeTypes - Optional array of types to include (if not provided, includes all)
 * @param excludeTypes - Optional array of types to exclude
 * @returns Filtered array of organization types with labels
 */
export function getOrganizationTypeOptions(
  includeTypes?: OrganizationType[],
  excludeTypes?: OrganizationType[]
): Array<{ value: OrganizationType; label: string; description: string }> {
  let types = [...ORGANIZATION_TYPE_DISPLAY_ORDER];
  
  if (includeTypes) {
    types = types.filter(type => includeTypes.includes(type));
  }
  
  if (excludeTypes) {
    types = types.filter(type => !excludeTypes.includes(type));
  }
  
  return types.map(type => ({
    value: type,
    label: ORGANIZATION_TYPE_LABELS[type],
    description: ORGANIZATION_TYPE_DESCRIPTIONS[type],
  }));
}

/**
 * Check if organization type matches any of the provided types
 * Utility for filtering metrics and benchmarks by organization type
 * 
 * @param orgType - The organization type to check
 * @param allowedTypes - Array of allowed types (null/undefined means all types allowed)
 * @returns True if the organization type is allowed
 * 
 * @example
 * ```typescript
 * // Check if metric is available for college organizations
 * const isAvailable = isOrganizationTypeAllowed('college', metric.availableOrgTypes);
 * ```
 */
export function isOrganizationTypeAllowed(
  orgType: OrganizationType,
  allowedTypes: OrganizationType[] | null | undefined
): boolean {
  // If no restriction is set (null/undefined), allow all types
  if (!allowedTypes || allowedTypes.length === 0) {
    return true;
  }
  
  return allowedTypes.includes(orgType);
}

/**
 * Group organization types by category for display purposes
 * Useful for creating grouped select options or hierarchical menus
 * 
 * @returns Grouped organization types
 */
export function getGroupedOrganizationTypes(): Record<string, Array<{ value: OrganizationType; label: string }>> {
  return {
    'Educational': [
      { value: 'youth', label: ORGANIZATION_TYPE_LABELS.youth },
      { value: 'high_school', label: ORGANIZATION_TYPE_LABELS.high_school },
      { value: 'college', label: ORGANIZATION_TYPE_LABELS.college },
    ],
    'Competitive': [
      { value: 'club', label: ORGANIZATION_TYPE_LABELS.club },
      { value: 'elite_academy', label: ORGANIZATION_TYPE_LABELS.elite_academy },
    ],
    'Facilities': [
      { value: 'private_facility', label: ORGANIZATION_TYPE_LABELS.private_facility },
    ],
  };
}

/**
 * Create a Zod schema for organization type validation with custom error messages
 * 
 * @param required - Whether the field is required (defaults to true)
 * @param errorMessage - Custom error message
 * @returns Zod schema for organization type validation
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   orgType: createOrganizationTypeSchema(true, 'Please select an organization type')
 * });
 * ```
 */
export function createOrganizationTypeSchema(
  required: boolean = true,
  errorMessage?: string
): z.ZodSchema<OrganizationType | undefined> {
  const baseSchema = z.enum(organizationTypeEnum, {
    errorMap: () => ({
      message: errorMessage || 'Please select a valid organization type'
    })
  });
  
  return required ? baseSchema : baseSchema.optional();
}

/**
 * Performance-optimized organization type lookup
 * Uses Map for O(1) lookups when processing large datasets
 */
export class OrganizationTypeLookup {
  private labelMap: Map<OrganizationType, string>;
  private descriptionMap: Map<OrganizationType, string>;
  private colorMap: Map<OrganizationType, string>;
  
  constructor() {
    this.labelMap = new Map(Object.entries(ORGANIZATION_TYPE_LABELS) as [OrganizationType, string][]);
    this.descriptionMap = new Map(Object.entries(ORGANIZATION_TYPE_DESCRIPTIONS) as [OrganizationType, string][]);
    this.colorMap = new Map(Object.entries(ORGANIZATION_TYPE_COLORS) as [OrganizationType, string][]);
  }
  
  /**
   * Get label with O(1) lookup time
   */
  getLabel(orgType: OrganizationType): string {
    return this.labelMap.get(orgType) || 'Unknown';
  }
  
  /**
   * Get description with O(1) lookup time
   */
  getDescription(orgType: OrganizationType): string {
    return this.descriptionMap.get(orgType) || 'No description available';
  }
  
  /**
   * Get colors with O(1) lookup time
   */
  getColors(orgType: OrganizationType): string {
    return this.colorMap.get(orgType) || 'bg-gray-100 text-gray-800';
  }
  
  /**
   * Batch process multiple organization types efficiently
   */
  processMany(orgTypes: OrganizationType[]): Array<{
    type: OrganizationType;
    label: string;
    description: string;
    colors: string;
  }> {
    return orgTypes.map(type => ({
      type,
      label: this.getLabel(type),
      description: this.getDescription(type),
      colors: this.getColors(type),
    }));
  }
}

/**
 * Singleton instance of OrganizationTypeLookup for reuse across the application
 * Use this for performance-critical operations
 */
export const organizationTypeLookup = new OrganizationTypeLookup();

/**
 * SQL fragment for organization type array filtering
 * Provides optimized SQL for database queries with organization type filtering
 *
 * @deprecated **SECURITY WARNING**: This function uses raw SQL string interpolation.
 * While inputs are validated (column via whitelist, orgType via enum), this pattern
 * is fragile and should be migrated to Drizzle ORM's parameterized queries.
 *
 * @since 2025-11-09 - Initial implementation
 * @deprecated-removal 2.0.0 - Will be removed in next major version
 *
 * **Migration Required Before Next Major Release**
 *
 * Current usage (to be replaced):
 * ```typescript
 * const filter = getOrganizationTypeFilterSQL('college');
 * ```
 *
 * Recommended migration using Drizzle SQL templates:
 * ```typescript
 * import { sql } from 'drizzle-orm';
 * import { siteMetrics } from '@shared/schema';
 *
 * // Using Drizzle's sql template tag for type-safe, parameterized queries
 * const filter = sql`(${siteMetrics.availableOrgTypes} IS NULL OR ${siteMetrics.availableOrgTypes} && ARRAY[${orgType}]::text[])`;
 *
 * // Or use Drizzle's array operators
 * import { arrayContains, isNull, or } from 'drizzle-orm';
 * const condition = or(
 *   isNull(siteMetrics.availableOrgTypes),
 *   arrayContains(siteMetrics.availableOrgTypes, [orgType])
 * );
 * ```
 *
 * @param orgType - The organization type to filter by
 * @param columnName - The column name containing the array (defaults to 'available_org_types')
 * @returns SQL fragment for WHERE clause
 *
 * @throws {Error} If columnName is not in the whitelist (prevents SQL injection)
 *
 * @example
 * ```sql
 * SELECT * FROM site_metrics
 * WHERE ${getOrganizationTypeFilterSQL('college')}
 * ```
 */
export function getOrganizationTypeFilterSQL(
  orgType: OrganizationType,
  columnName: string = 'available_org_types'
): string {
  // Validate column name against whitelist to prevent SQL injection
  const validColumns = ['available_org_types', 'applicable_org_types'];
  if (!validColumns.includes(columnName)) {
    throw new Error(`Invalid column name: ${columnName}. Allowed columns: ${validColumns.join(', ')}`);
  }

  // Additional runtime validation of orgType to prevent SQL injection
  // Even though TypeScript enforces the type, validate at runtime for API boundaries
  if (!isValidOrganizationType(orgType)) {
    throw new Error(
      `Invalid organization type: "${orgType}". Expected one of: ${organizationTypeEnum.join(', ')}`
    );
  }

  // SECURITY NOTE: This function returns a raw SQL string. While both parameters are validated
  // (columnName via whitelist, orgType via enum validation), the preferred approach is to use
  // Drizzle ORM's parameterized queries. This function is kept for backward compatibility but
  // should be migrated to use Drizzle SQL templates in future refactoring.
  //
  // Recommended migration:
  // import { sql } from 'drizzle-orm';
  // const filter = sql`(${column} IS NULL OR ${column} && ARRAY[${orgType}]::text[])`;
  return `(${columnName} IS NULL OR ${columnName} && ARRAY['${orgType}']::text[])`;
}

/**
 * Create bulk organization type validation for API endpoints
 * Validates and normalizes organization type data from API requests
 * 
 * @param data - Array of items with organization type fields
 * @param typeField - The field name containing organization type (defaults to 'orgType')
 * @returns Validated and normalized data
 * 
 * @throws {Error} If any organization type is invalid
 */
export function validateOrganizationTypesBulk<T extends Record<string, any>>(
  data: T[],
  typeField: keyof T = 'orgType' as keyof T
): T[] {
  const invalidTypes: Array<{ index: number; value: unknown }> = [];
  
  const validatedData = data.map((item, index) => {
    const orgType = item[typeField];
    if (orgType != null && !isValidOrganizationType(orgType)) {
      invalidTypes.push({ index, value: orgType });
      return item;
    }
    
    return {
      ...item,
      [typeField]: parseOrganizationType(orgType),
    };
  });
  
  if (invalidTypes.length > 0) {
    throw new Error(
      `Invalid organization types found at indices: ${
        invalidTypes.map(({ index, value }) => `${index} (${value})`).join(', ')
      }`
    );
  }
  
  return validatedData;
}

/**
 * Export organization type constants for external consumption
 * Allows importing specific constants without importing the entire module
 */
export const OrganizationTypeConstants = {
  TYPES: organizationTypeEnum,
  LABELS: ORGANIZATION_TYPE_LABELS,
  DESCRIPTIONS: ORGANIZATION_TYPE_DESCRIPTIONS,
  COLORS: ORGANIZATION_TYPE_COLORS,
  DISPLAY_ORDER: ORGANIZATION_TYPE_DISPLAY_ORDER,
} as const;