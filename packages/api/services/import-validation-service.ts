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
 * Result of a code validation check (metric, sport, or position)
 * Renamed from ValidationResult to avoid collision with import-types.ts ValidationResult
 */
export interface CodeValidationResult {
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
 * Removes potentially dangerous characters and truncates excessively long codes
 */
function sanitizeCode(code: string, maxLength = 50): string {
  if (!code) return '';

  // Remove HTML special characters and control characters
  let sanitized = code
    .replace(/[<>'"&]/g, '') // Remove HTML special chars
    .replace(/[\x00-\x1F\x7F]/g, ''); // Remove control characters

  if (sanitized.length <= maxLength) return sanitized;
  return sanitized.slice(0, maxLength) + '...';
}

/**
 * Simple cache entry for validation context
 */
interface CacheEntry {
  context: ValidationContext;
  timestamp: number;
}

export class ImportValidationService {
  // In-memory cache with 30-second TTL to prevent stale data during schema changes
  // Reduced from 5 minutes to ensure recently deactivated metrics/sports are not used
  private contextCache: CacheEntry | null = null;
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 seconds

  /**
   * Load validation context from database
   * Queries all active metrics, sports, and positions and caches them in Maps
   * Uses in-memory cache with 30-second TTL for performance while ensuring freshness
   */
  async loadValidationContext(): Promise<ValidationContext> {
    // Check if cached context is still valid
    if (this.contextCache) {
      const age = Date.now() - this.contextCache.timestamp;
      if (age < this.CACHE_TTL_MS) {
        return this.contextCache.context;
      }
      // Cache expired, clear it
      this.contextCache = null;
    }
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

      const context: ValidationContext = {
        metrics: metricsMap,
        sports: sportsMap,
        positions: positionsMap,
      };

      // Cache the context for future requests
      this.contextCache = {
        context,
        timestamp: Date.now(),
      };

      return context;
    } catch (error) {
      console.error('Failed to load validation context:', error);
      throw new Error('Unable to load validation data for import. Please try again later.');
    }
  }

  /**
   * Validate metric code against context
   * Case-insensitive validation
   */
  validateMetricCode(code: string, context: ValidationContext): CodeValidationResult {
    // Null/undefined guard
    if (!code || typeof code !== 'string') {
      return {
        valid: false,
        warning: 'Metric code is required and must be a string',
      };
    }

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
  validateSportCode(code: string, context: ValidationContext): CodeValidationResult {
    // Null/undefined guard
    if (!code || typeof code !== 'string') {
      return {
        valid: false,
        warning: 'Sport code is required and must be a string',
      };
    }

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
   * Validate position against sport + context
   * Accepts position code, name, or shortName (case-insensitive)
   * Priority order: code > name > shortName
   */
  validatePositionCode(
    sportCode: string,
    positionCode: string,
    context: ValidationContext
  ): CodeValidationResult {
    // Null/undefined guards
    if (!sportCode || typeof sportCode !== 'string') {
      return {
        valid: false,
        warning: 'Sport code is required and must be a string',
      };
    }
    if (!positionCode || typeof positionCode !== 'string') {
      return {
        valid: false,
        warning: 'Position code is required and must be a string',
      };
    }

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

    // Case-insensitive search for position by code, name, or shortName (priority order: code > name > shortName)
    // Single-pass lookup with priority tracking for O(n) performance
    const normalizedInput = positionCode.toUpperCase();
    let position: typeof sportPositions[0] | undefined;
    let nameMatch: typeof sportPositions[0] | undefined;
    let shortNameMatch: typeof sportPositions[0] | undefined;

    for (const p of sportPositions) {
      if (p.code.toUpperCase() === normalizedInput) {
        position = p; // Code match - highest priority, stop immediately
        break;
      }
      if (!nameMatch && p.name.toUpperCase() === normalizedInput) {
        nameMatch = p; // First name match
      }
      if (!shortNameMatch && p.shortName?.toUpperCase() === normalizedInput) {
        shortNameMatch = p; // First shortName match
      }
    }
    // Apply priority: code > name > shortName
    position = position || nameMatch || shortNameMatch;

    if (position) {
      return {
        valid: true,
        value: position,
      };
    }

    // Generate warning with list of valid positions for this sport (code/name/shortName format)
    const validPositionFormats = sportPositions.map(p => {
      const formats = [p.code, p.name];
      if (p.shortName) {
        formats.push(p.shortName);
      }
      return formats.join('/');
    });
    return {
      valid: false,
      warning: `Position '${sanitizeCode(positionCode)}' not found for sport '${sanitizeCode(sportCode)}'. Valid positions: ${validPositionFormats.join(', ')}`,
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
