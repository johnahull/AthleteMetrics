/**
 * Import Validation Service
 * Validates CSV import data against database-defined metrics, sports, and positions
 *
 * This service provides permissive validation for CSV imports, returning warnings
 * instead of errors when validation fails. This allows imports to proceed with
 * user-friendly feedback about what needs correction.
 *
 * Key Features:
 * - Case-insensitive validation
 * - Database-driven validation (no hardcoded values)
 * - Only validates against active (isActive=true) entities
 * - Provides helpful alternative suggestions in warning messages
 *
 * Usage Example:
 * ```typescript
 * const service = new ImportValidationService();
 * const context = await service.loadValidationContext();
 *
 * // Validate a metric code from CSV
 * const result = service.validateMetricCode('FLY10_TIME', context);
 * if (!result.valid) {
 *   console.warn(result.warning); // "Metric code 'FLY10_TIME' not found. Valid: ..."
 * }
 *
 * // Get valid options for CSV template generation
 * const validMetrics = service.getValidMetricCodes(context);
 * ```
 */

import { db } from '../db';
import { siteMetrics, siteSports, sitePositions } from '@shared/schema';
import type { SiteMetric, SiteSport, SitePosition } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Result of a validation check
 */
export interface ValidationResult {
  valid: boolean;
  value?: any; // The validated entity from DB (SiteMetric, SiteSport, or SitePosition)
  warning?: string; // For permissive mode warnings (includes suggestions)
  error?: string; // For strict mode errors (currently unused, reserved for future)
}

/**
 * Cached validation data loaded from database
 * Call loadValidationContext() once and reuse for multiple validations
 */
export interface ValidationContext {
  metrics: Map<string, SiteMetric>; // Keyed by UPPERCASE code for case-insensitive lookup
  sports: Map<string, SiteSport>; // Keyed by UPPERCASE code for case-insensitive lookup
  positions: Map<string, SitePosition[]>; // Keyed by sportId (UUID)
}

/**
 * Sanitize user input for display in warning messages
 * Truncates excessively long codes to prevent log/UI issues
 */
function sanitizeCode(code: string, maxLength = 50): string {
  if (code.length <= maxLength) return code;
  return code.slice(0, maxLength) + '...';
}

export class ImportValidationService {
  /**
   * Load validation context from database
   * Queries all active metrics, sports, and positions and caches them in Maps
   */
  async loadValidationContext(): Promise<ValidationContext> {
    try {
      // Load all active metrics, sports, and positions in parallel
      const [activeMetrics, activeSports, activePositions] = await Promise.all([
        db.select().from(siteMetrics).where(eq(siteMetrics.isActive, true)),
        db.select().from(siteSports).where(eq(siteSports.isActive, true)),
        db.select().from(sitePositions).where(eq(sitePositions.isActive, true)),
      ]);

      // Build metrics map (keyed by code, case-insensitive)
      const metricsMap = new Map<string, SiteMetric>();
      activeMetrics.forEach(metric => {
        metricsMap.set(metric.code.toUpperCase(), metric);
      });

      // Build sports map (keyed by code, case-insensitive)
      const sportsMap = new Map<string, SiteSport>();
      activeSports.forEach(sport => {
        sportsMap.set(sport.code.toUpperCase(), sport);
      });

      // Build positions map (keyed by sportId)
      const positionsMap = new Map<string, SitePosition[]>();
      activePositions.forEach(position => {
        const sportPositions = positionsMap.get(position.sportId) || [];
        sportPositions.push(position);
        positionsMap.set(position.sportId, sportPositions);
      });

      return {
        metrics: metricsMap,
        sports: sportsMap,
        positions: positionsMap,
      };
    } catch (error) {
      console.error('Failed to load validation context:', error);
      throw new Error('Unable to load validation data for import. Please try again later.');
    }
  }

  /**
   * Validate metric code against context
   * Case-insensitive validation
   */
  validateMetricCode(code: string, context: ValidationContext): ValidationResult {
    const normalizedCode = code.toUpperCase();
    const metric = context.metrics.get(normalizedCode);

    if (metric) {
      return {
        valid: true,
        value: metric,
      };
    }

    // Generate warning with list of valid alternatives (limit to 20 for readability)
    const allCodes = Array.from(context.metrics.keys());
    const displayCodes = allCodes.slice(0, 20);
    const suffix = allCodes.length > 20 ? ` ... and ${allCodes.length - 20} more` : '';
    return {
      valid: false,
      warning: `Metric code '${sanitizeCode(code)}' not found. Valid metric codes: ${displayCodes.join(', ')}${suffix}`,
    };
  }

  /**
   * Validate sport code against context
   * Case-insensitive validation
   */
  validateSportCode(code: string, context: ValidationContext): ValidationResult {
    const normalizedCode = code.toUpperCase();
    const sport = context.sports.get(normalizedCode);

    if (sport) {
      return {
        valid: true,
        value: sport,
      };
    }

    // Generate warning with list of valid alternatives (limit to 20 for readability)
    const allCodes = Array.from(context.sports.keys());
    const displayCodes = allCodes.slice(0, 20);
    const suffix = allCodes.length > 20 ? ` ... and ${allCodes.length - 20} more` : '';
    return {
      valid: false,
      warning: `Sport code '${sanitizeCode(code)}' not found. Valid sport codes: ${displayCodes.join(', ')}${suffix}`,
    };
  }

  /**
   * Validate position code against sport + context
   * Case-insensitive validation for both sport and position codes
   */
  validatePositionCode(
    sportCode: string,
    positionCode: string,
    context: ValidationContext
  ): ValidationResult {
    const normalizedSportCode = sportCode.toUpperCase();
    const sport = context.sports.get(normalizedSportCode);

    if (!sport) {
      const allCodes = Array.from(context.sports.keys());
      const displayCodes = allCodes.slice(0, 20);
      const suffix = allCodes.length > 20 ? ` ... and ${allCodes.length - 20} more` : '';
      return {
        valid: false,
        warning: `Sport code '${sanitizeCode(sportCode)}' not found. Valid sport codes: ${displayCodes.join(', ')}${suffix}`,
      };
    }

    // Get positions for this sport
    const sportPositions = context.positions.get(sport.id) || [];

    // Case-insensitive search for position code
    const normalizedPositionCode = positionCode.toUpperCase();
    const position = sportPositions.find(p => p.code.toUpperCase() === normalizedPositionCode);

    if (position) {
      return {
        valid: true,
        value: position,
      };
    }

    // Generate warning with list of valid positions for this sport
    const validPositionCodes = sportPositions.map(p => p.code);
    return {
      valid: false,
      warning: `Position code '${sanitizeCode(positionCode)}' not found for sport '${sanitizeCode(sportCode)}'. Valid position codes: ${validPositionCodes.join(', ')}`,
    };
  }

  /**
   * Get all valid metric codes from context
   */
  getValidMetricCodes(context: ValidationContext): string[] {
    return Array.from(context.metrics.keys());
  }

  /**
   * Get all valid sport codes from context
   */
  getValidSportCodes(context: ValidationContext): string[] {
    return Array.from(context.sports.keys());
  }

  /**
   * Get all valid position codes for a specific sport
   * Case-insensitive sport code lookup
   */
  getValidPositionCodes(sportCode: string, context: ValidationContext): string[] {
    const normalizedSportCode = sportCode.toUpperCase();
    const sport = context.sports.get(normalizedSportCode);

    if (!sport) {
      return [];
    }

    const sportPositions = context.positions.get(sport.id) || [];
    return sportPositions.map(p => p.code);
  }
}

/**
 * Singleton instance for use across the application
 * Preferred over creating new instances to maintain consistency
 */
export const importValidationService = new ImportValidationService();
