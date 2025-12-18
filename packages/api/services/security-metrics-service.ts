/**
 * SecurityMetricsService - Provides security event metrics and pattern detection
 * Used for monitoring authorization failures (403 errors) and suspicious activity
 */

import { db } from '../db';
import { securityEvents } from '@shared/enhanced-auth-schema';
import { eq, gte, and, count, desc } from 'drizzle-orm';

/**
 * Pattern detection thresholds
 * Adjust these values to tune sensitivity of suspicious activity detection
 */
const PATTERN_THRESHOLDS = {
  /** Number of failures from same IP to flag as suspicious */
  IP_FAILURE_THRESHOLD: 10,
  /** IP failure count for medium severity */
  IP_MEDIUM_SEVERITY: 20,
  /** IP failure count for high severity */
  IP_HIGH_SEVERITY: 50,
  /** Number of failures for same user to flag as suspicious */
  USER_FAILURE_THRESHOLD: 5,
  /** User failure count for medium severity */
  USER_MEDIUM_SEVERITY: 10,
  /** User failure count for high severity */
  USER_HIGH_SEVERITY: 20,
} as const;

export interface SecurityMetrics {
  total403Count: number;
  errorsByUser: { userId: string | null; count: number }[];
  errorsByIP: { ipAddress: string | null; count: number }[];
  suspiciousPatterns: SuspiciousPattern[];
  timeWindowMinutes: number;
}

export interface SuspiciousPattern {
  type: 'high_frequency_ip' | 'high_frequency_user';
  identifier: string;
  count: number;
  severity: 'low' | 'medium' | 'high';
}

export class SecurityMetricsService {
  /**
   * Get comprehensive security metrics for a given time window
   * @param windowMinutes - Time window in minutes to analyze (default: 60, max: 10080/7 days)
   *
   * Performance Note: Larger windows query more rows. For windows > 24 hours,
   * consider background job processing instead of real-time queries.
   */
  async getMetrics(windowMinutes: number = 60): Promise<SecurityMetrics> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    // Get total 403 count
    const total403Count = await this.get403ErrorCount(since);

    // Get errors grouped by user
    const errorsByUser = await this.get403ErrorsByUser(since);

    // Get errors grouped by IP
    const errorsByIP = await this.get403ErrorsByIP(since);

    // Detect suspicious patterns
    const suspiciousPatterns = this.detectPatterns(errorsByIP, errorsByUser);

    return {
      total403Count,
      errorsByUser,
      errorsByIP,
      suspiciousPatterns,
      timeWindowMinutes: windowMinutes,
    };
  }

  /**
   * Count total authorization_failed events since a given time
   */
  private async get403ErrorCount(since: Date): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.eventType, 'authorization_failed'),
          gte(securityEvents.createdAt, since)
        )
      );
    return result[0]?.count ?? 0;
  }

  /**
   * Get authorization failures grouped by user
   */
  private async get403ErrorsByUser(
    since: Date
  ): Promise<{ userId: string | null; count: number }[]> {
    const result = await db
      .select({
        userId: securityEvents.userId,
        count: count(),
      })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.eventType, 'authorization_failed'),
          gte(securityEvents.createdAt, since)
        )
      )
      .groupBy(securityEvents.userId)
      .orderBy(desc(count()))
      .limit(20);

    return result;
  }

  /**
   * Get authorization failures grouped by IP address
   */
  private async get403ErrorsByIP(
    since: Date
  ): Promise<{ ipAddress: string | null; count: number }[]> {
    const result = await db
      .select({
        ipAddress: securityEvents.ipAddress,
        count: count(),
      })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.eventType, 'authorization_failed'),
          gte(securityEvents.createdAt, since)
        )
      )
      .groupBy(securityEvents.ipAddress)
      .orderBy(desc(count()))
      .limit(20);

    return result;
  }

  /**
   * Detect suspicious patterns in the error data
   * Uses configurable thresholds from PATTERN_THRESHOLDS constant
   */
  private detectPatterns(
    byIP: { ipAddress: string | null; count: number }[],
    byUser: { userId: string | null; count: number }[]
  ): SuspiciousPattern[] {
    const patterns: SuspiciousPattern[] = [];

    // High frequency IP detection
    byIP
      .filter((r) => r.count > PATTERN_THRESHOLDS.IP_FAILURE_THRESHOLD)
      .forEach((r) => {
        patterns.push({
          type: 'high_frequency_ip',
          identifier: r.ipAddress ?? 'unknown',
          count: r.count,
          severity:
            r.count > PATTERN_THRESHOLDS.IP_HIGH_SEVERITY
              ? 'high'
              : r.count > PATTERN_THRESHOLDS.IP_MEDIUM_SEVERITY
                ? 'medium'
                : 'low',
        });
      });

    // High frequency user detection (type guard ensures userId is string)
    byUser
      .filter((r): r is { userId: string; count: number } =>
        r.userId !== null && r.count > PATTERN_THRESHOLDS.USER_FAILURE_THRESHOLD
      )
      .forEach((r) => {
        patterns.push({
          type: 'high_frequency_user',
          identifier: r.userId,
          count: r.count,
          severity:
            r.count > PATTERN_THRESHOLDS.USER_HIGH_SEVERITY
              ? 'high'
              : r.count > PATTERN_THRESHOLDS.USER_MEDIUM_SEVERITY
                ? 'medium'
                : 'low',
        });
      });

    return patterns;
  }
}

// Export singleton instance
export const securityMetricsService = new SecurityMetricsService();
