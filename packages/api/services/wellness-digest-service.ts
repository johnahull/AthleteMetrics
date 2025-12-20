/**
 * Wellness Digest Service
 *
 * Provides daily wellness digest functionality for coaches:
 * - Queries at-risk athletes (red/yellow status) from last 24 hours
 * - Sends push notifications and emails to coaches with digest summary
 * - Respects organization notification settings (digest time, skip weekends)
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and, gte, inArray, desc, sql } from 'drizzle-orm';
import type * as schema from '@shared/schema';
import {
  organizations,
  users,
  userOrganizations,
  wellnessResponses,
  wellnessTemplates,
  orgNotificationSettings,
  notificationPreferences,
  siteSettings,
} from '@shared/schema';
import { calculateAthleteStatus, type AthleteStatus } from '@shared/wellness-status-utils';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { getPushNotificationService, type NotificationPayload } from './push-notification-service';

interface AtRiskAthlete {
  userId: string;
  userFullName: string;
  status: 'red' | 'yellow';
  score: number | null;
  hasInjuries: boolean;
  teamId?: string | null;
  teamName?: string | null;
  submittedAt: Date;
}

interface DigestResult {
  orgId: string;
  orgName: string;
  atRiskCount: number;
  redCount: number;
  yellowCount: number;
  coachesSent: number;
  coachesFailed: number;
}

export class WellnessDigestService {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Get all at-risk athletes in an organization from the last 24 hours
   */
  async getAtRiskAthletes(orgId: string): Promise<AtRiskAthlete[]> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    // Get recent wellness responses for this org
    const responses = await this.db
      .select({
        id: wellnessResponses.id,
        userId: wellnessResponses.userId,
        userFullName: wellnessResponses.userFullName,
        templateId: wellnessResponses.templateId,
        responses: wellnessResponses.responses,
        teamId: wellnessResponses.teamId,
        teamNameSnapshot: wellnessResponses.teamNameSnapshot,
        submittedAt: wellnessResponses.submittedAt,
      })
      .from(wellnessResponses)
      .where(
        and(
          eq(wellnessResponses.organizationId, orgId),
          gte(wellnessResponses.submittedAt, twentyFourHoursAgo)
        )
      )
      .orderBy(desc(wellnessResponses.submittedAt));

    if (responses.length === 0) {
      return [];
    }

    // Get unique template IDs
    const templateIds = [...new Set(responses.map(r => r.templateId))];

    // Fetch all templates used
    const templates = await this.db
      .select()
      .from(wellnessTemplates)
      .where(inArray(wellnessTemplates.id, templateIds));

    const templateMap = new Map(templates.map(t => [t.id, t]));

    // Calculate status for each response and filter at-risk
    const atRiskAthletes: AtRiskAthlete[] = [];
    const seenAthletes = new Set<string>(); // Only include latest response per athlete

    for (const response of responses) {
      // Skip if we've already processed this athlete (we ordered by submittedAt desc)
      if (seenAthletes.has(response.userId)) {
        continue;
      }
      seenAthletes.add(response.userId);

      const template = templateMap.get(response.templateId);
      if (!template) {
        continue;
      }

      // Cast to proper types for calculateAthleteStatus
      const wellnessResponse: WellnessResponse = {
        id: response.id,
        userId: response.userId,
        userFullName: response.userFullName,
        responses: response.responses as Record<string, any>,
        submittedAt: response.submittedAt,
      } as WellnessResponse;

      const wellnessTemplate: WellnessTemplate = {
        id: template.id,
        name: template.name,
        config: template.config as WellnessTemplate['config'],
      } as WellnessTemplate;

      const status = calculateAthleteStatus(wellnessResponse, wellnessTemplate);

      if (status.status === 'red' || status.status === 'yellow') {
        atRiskAthletes.push({
          userId: response.userId,
          userFullName: response.userFullName,
          status: status.status,
          score: status.score,
          hasInjuries: status.injuries.length > 0,
          teamId: response.teamId,
          teamName: response.teamNameSnapshot,
          submittedAt: response.submittedAt,
        });
      }
    }

    return atRiskAthletes;
  }

  /**
   * Get all coaches and org admins in an organization who should receive the digest
   */
  async getDigestRecipients(orgId: string): Promise<Array<{ userId: string; emails: string[] | null; fullName: string | null }>> {
    const recipients = await this.db
      .select({
        userId: users.id,
        emails: users.emails,
        fullName: users.fullName,
      })
      .from(users)
      .innerJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .leftJoin(notificationPreferences, eq(users.id, notificationPreferences.userId))
      .where(
        and(
          eq(userOrganizations.organizationId, orgId),
          inArray(userOrganizations.role, ['coach', 'org_admin']),
          // Only include users who have digest enabled (or haven't set preferences yet - default to true)
          sql`(${notificationPreferences.pushWellnessDigest} IS NULL OR ${notificationPreferences.pushWellnessDigest} = true)`
        )
      );

    return recipients;
  }

  /**
   * Send wellness digest to all coaches in an organization
   */
  async sendDigest(orgId: string): Promise<DigestResult> {
    // Get org name for notification
    const [org] = await this.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${orgId} not found`);
    }

    const atRiskAthletes = await this.getAtRiskAthletes(orgId);

    // If no at-risk athletes, don't send digest
    if (atRiskAthletes.length === 0) {
      return {
        orgId,
        orgName: org.name,
        atRiskCount: 0,
        redCount: 0,
        yellowCount: 0,
        coachesSent: 0,
        coachesFailed: 0,
      };
    }

    const redCount = atRiskAthletes.filter(a => a.status === 'red').length;
    const yellowCount = atRiskAthletes.filter(a => a.status === 'yellow').length;

    // Get recipient coaches
    const recipients = await this.getDigestRecipients(orgId);

    if (recipients.length === 0) {
      return {
        orgId,
        orgName: org.name,
        atRiskCount: atRiskAthletes.length,
        redCount,
        yellowCount,
        coachesSent: 0,
        coachesFailed: 0,
      };
    }

    // Build notification
    const notification: NotificationPayload = {
      type: 'wellness_digest',
      title: 'Daily Wellness Summary',
      body: this.buildDigestBody(redCount, yellowCount, atRiskAthletes),
      url: '/wellness-analytics',
      tag: `wellness-digest-${orgId}-${new Date().toISOString().split('T')[0]}`,
      requireInteraction: redCount > 0, // Require interaction if there are red athletes
      data: {
        orgId,
        redCount,
        yellowCount,
        athleteIds: atRiskAthletes.map(a => a.userId),
      },
    };

    // Send to all recipients
    const pushService = getPushNotificationService(this.db);
    let coachesSent = 0;
    let coachesFailed = 0;

    for (const recipient of recipients) {
      try {
        const result = await pushService.sendToUser(recipient.userId, notification, orgId);
        if (result.successful > 0) {
          coachesSent++;
        } else if (!result.noSubscription && !result.skipped) {
          coachesFailed++;
        }
        // If noSubscription or skipped, we don't count as failed (user hasn't set up push)
      } catch (error) {
        console.error(`Failed to send digest to coach ${recipient.userId}:`, error);
        coachesFailed++;
      }
    }

    return {
      orgId,
      orgName: org.name,
      atRiskCount: atRiskAthletes.length,
      redCount,
      yellowCount,
      coachesSent,
      coachesFailed,
    };
  }

  /**
   * Build the notification body message
   */
  private buildDigestBody(redCount: number, yellowCount: number, athletes: AtRiskAthlete[]): string {
    const parts: string[] = [];

    if (redCount > 0) {
      parts.push(`${redCount} athlete${redCount > 1 ? 's' : ''} need${redCount === 1 ? 's' : ''} attention`);
    }

    if (yellowCount > 0) {
      parts.push(`${yellowCount} require${yellowCount === 1 ? 's' : ''} monitoring`);
    }

    // Add injury info if any
    const injuryCount = athletes.filter(a => a.hasInjuries).length;
    if (injuryCount > 0) {
      parts.push(`${injuryCount} reported injuries`);
    }

    return parts.join(', ');
  }

  /**
   * Get organizations that should receive digests now based on their timezone and digest time
   * This is called by the scheduler every minute
   */
  async getOrganizationsForDigest(): Promise<Array<{ orgId: string; orgName: string }>> {
    const now = new Date();
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = currentDayOfWeek === 0 || currentDayOfWeek === 6;

    // Get all orgs with their notification settings
    const orgsWithSettings = await this.db
      .select({
        orgId: organizations.id,
        orgName: organizations.name,
        wellnessEnabled: organizations.wellnessEnabled,
        digestTime: orgNotificationSettings.digestTime,
        digestTimezone: orgNotificationSettings.digestTimezone,
        digestSkipWeekends: orgNotificationSettings.digestSkipWeekends,
        pushEnabled: orgNotificationSettings.pushEnabled,
        wellnessDigestEnabled: orgNotificationSettings.wellnessDigestEnabled,
      })
      .from(organizations)
      .leftJoin(orgNotificationSettings, eq(organizations.id, orgNotificationSettings.orgId))
      .where(eq(organizations.wellnessEnabled, true));

    const eligibleOrgs: Array<{ orgId: string; orgName: string }> = [];

    for (const org of orgsWithSettings) {
      // Skip if push or digest is disabled for the org
      if (org.pushEnabled === false || org.wellnessDigestEnabled === false) {
        continue;
      }

      // Skip weekends if configured
      if (isWeekend && org.digestSkipWeekends) {
        continue;
      }

      // Get digest time in org's timezone (default to 07:00 America/New_York)
      const digestTime = org.digestTime || '07:00';
      const timezone = org.digestTimezone || 'America/New_York';

      // Check if current time matches digest time in the org's timezone
      if (this.isTimeToSendDigest(now, digestTime, timezone)) {
        eligibleOrgs.push({
          orgId: org.orgId,
          orgName: org.orgName,
        });
      }
    }

    return eligibleOrgs;
  }

  /**
   * Check if the current time matches the digest time for a given timezone
   * Returns true only at the exact minute (to avoid duplicate sends)
   */
  private isTimeToSendDigest(now: Date, digestTime: string, timezone: string): boolean {
    try {
      // Get current time in the organization's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const currentTimeInTz = formatter.format(now);

      // Compare with digest time (format: HH:MM)
      return currentTimeInTz === digestTime;
    } catch (error) {
      console.error(`Invalid timezone ${timezone}, skipping:`, error);
      return false;
    }
  }

  /**
   * Check if the global push notification kill switch is enabled
   */
  async isGlobalPushEnabled(): Promise<boolean> {
    const settings = await this.db.select().from(siteSettings).limit(1);
    return settings.length === 0 || settings[0].pushNotificationsEnabled !== false;
  }
}

// Singleton instance
let digestServiceInstance: WellnessDigestService | null = null;

export function getWellnessDigestService(db: PostgresJsDatabase<typeof schema>): WellnessDigestService {
  if (!digestServiceInstance) {
    digestServiceInstance = new WellnessDigestService(db);
  }
  return digestServiceInstance;
}
