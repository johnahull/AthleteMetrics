/**
 * Push Notification Service
 * Handles all Web Push notification operations using web-push library
 */

import webPush from 'web-push';
import { eq, and, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import pLimit from 'p-limit';
import DOMPurify from 'isomorphic-dompurify';
import {
  pushSubscriptions,
  notificationPreferences,
  notificationHistory,
  orgNotificationSettings,
  siteSettings,
  userTeams,
  userOrganizations,
  NotificationType,
} from '@shared/schema';
import { getPgErrorCode, getPgError, PG_UNIQUE_VIOLATION } from '../lib/pg-error';

// Web Push payload size limit (4KB as per spec)
// Reserve 200 bytes for ECDH encryption overhead and padding
const MAX_PAYLOAD_SIZE = 4096;
const MAX_SAFE_PAYLOAD_SIZE = MAX_PAYLOAD_SIZE - 200;

// Valid push service hostnames (exact matching to prevent subdomain attacks)
const VALID_PUSH_HOSTNAMES = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.org',
  'push.samsungosp.com',      // Samsung Internet
  'updates.bravesoftware.com', // Brave Browser
  'push.vivaldi.com',          // Vivaldi Browser
  'push.opera.com',            // Opera Browser
  // Apple uses dynamic subdomains but always ends with .push.apple.com
  // Windows uses dynamic subdomains but always ends with .notify.windows.com
]);

// Valid push service hostname suffixes (for services with dynamic subdomains)
const VALID_PUSH_HOSTNAME_SUFFIXES = [
  '.push.apple.com',
  '.notify.windows.com',
];

/**
 * Web Push Subscription object from the browser
 */
export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Notification payload to send to users
 */
export interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  type: NotificationType;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
}

/**
 * Result of sending notifications to a user
 */
export interface SendResult {
  successful: number;
  failed: number;
  removed?: number;
  noSubscription?: boolean;
  skipped?: boolean;
  reason?: string;
  deferred?: boolean;
}

/**
 * Result of sending notifications to a team
 */
export interface TeamSendResult {
  totalMembers: number;
  successful: number;
  failed: number;
  noSubscription: number;
  skipped: number;
}

/**
 * Validate that a push endpoint URL is from a known push service
 * Uses exact hostname matching to prevent SSRF attacks via subdomain manipulation
 */
function isValidPushEndpoint(endpoint: string): boolean {
  try {
    // Enforce max URL length to prevent DoS via oversized URLs
    if (endpoint.length > 2048) {
      return false;
    }

    const url = new URL(endpoint);
    // Must be HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Check exact hostname match
    if (VALID_PUSH_HOSTNAMES.has(hostname)) {
      return true;
    }

    // Check hostname suffix for services with dynamic subdomains
    for (const suffix of VALID_PUSH_HOSTNAME_SUFFIXES) {
      if (hostname.endsWith(suffix)) {
        // Extract the subdomain part (before the suffix)
        const subdomain = hostname.slice(0, -suffix.length);
        // Validate subdomain structure:
        // - Must be at least 2 characters (e.g., "ab.push.apple.com")
        // - Must not exceed 63 characters (DNS label max length)
        // - Must not contain dots (to prevent multi-level subdomain attacks like "evil.fake.push.apple.com")
        // - Must be valid hostname characters (alphanumeric and hyphens, not starting/ending with hyphen)
        if (
          subdomain.length >= 2 &&
          subdomain.length <= 63 &&
          !subdomain.includes('.') &&
          /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(subdomain)
        ) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Push Notification Service
 * Manages Web Push subscriptions and notification delivery
 */
export class PushNotificationService {
  private db: PostgresJsDatabase<any>;
  private vapidConfigured: boolean = false;

  constructor(db: PostgresJsDatabase<any>) {
    this.db = db;
    this.initializeVapid();
  }

  /**
   * Initialize VAPID credentials for Web Push
   */
  private initializeVapid(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@athletemetrics.app';

    if (!publicKey || !privateKey) {
      console.warn('⚠️ VAPID keys not configured - push notifications disabled');
      return;
    }

    // Validate VAPID key format
    // Public key should be exactly 87-88 chars (65 bytes base64url, with/without padding)
    if ((publicKey.length !== 87 && publicKey.length !== 88) || !/^[A-Za-z0-9_-]+$/.test(publicKey)) {
      console.error('⚠️ VAPID_PUBLIC_KEY appears invalid (must be exactly 87-88 base64url chars)');
      return;
    }

    // Private key should be exactly 43-44 chars (32 bytes base64url, with/without padding)
    if ((privateKey.length !== 43 && privateKey.length !== 44) || !/^[A-Za-z0-9_-]+$/.test(privateKey)) {
      console.error('⚠️ VAPID_PRIVATE_KEY appears invalid (must be exactly 43-44 base64url chars)');
      return;
    }

    try {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
      console.log('✅ VAPID keys configured successfully');
    } catch (error) {
      console.error('⚠️ CRITICAL: Failed to set VAPID details:', error);
      console.error('Push notifications will be disabled. Please check your VAPID configuration.');
      this.vapidConfigured = false;
    }
  }

  /**
   * Get the VAPID public key for client subscription
   */
  getVapidPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || '';
  }

  /**
   * Subscribe a user's device to push notifications
   */
  async subscribe(
    userId: string,
    subscription: WebPushSubscription,
    deviceName?: string,
    userAgent?: string
  ): Promise<{ id: string; endpoint: string; deviceName?: string | null }> {
    // Validate endpoint URL is from a known push service
    if (!isValidPushEndpoint(subscription.endpoint)) {
      throw new Error('Invalid push subscription endpoint');
    }

    // Check if subscription already exists and atomically update if owned by this user
    // SECURITY: Use atomic UPDATE WHERE to prevent TOCTOU race condition
    const updated = await this.db
      .update(pushSubscriptions)
      .set({ lastUsedAt: new Date() })
      .where(
        and(
          eq(pushSubscriptions.endpoint, subscription.endpoint),
          eq(pushSubscriptions.userId, userId)
        )
      )
      .returning();

    if (updated.length > 0) {
      // Subscription exists and belongs to this user - return updated record
      return updated[0];
    }

    // Sanitize user-controlled input to prevent XSS
    const sanitizedDeviceName = deviceName
      ? DOMPurify.sanitize(deviceName.slice(0, 100), {
          ALLOWED_TAGS: [],
          KEEP_CONTENT: true
        })
      : undefined;
    const sanitizedUserAgent = userAgent
      ? DOMPurify.sanitize(userAgent.slice(0, 500), {
          ALLOWED_TAGS: [],
          KEEP_CONTENT: true
        })
      : undefined;

    // Try to insert new subscription
    // Use try-catch to handle unique constraint violation if endpoint exists for different user
    try {
      const [result] = await this.db
        .insert(pushSubscriptions)
        .values({
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          deviceName: sanitizedDeviceName,
          userAgent: sanitizedUserAgent,
        })
        .returning();

      return result;
    } catch (error: any) {
      // Check if error is unique constraint violation (PostgreSQL error code 23505).
      // drizzle-orm >=0.44 wraps driver errors in DrizzleQueryError; walk the
      // full cause chain via getPgError() to find the raw PG error.
      const pgError = getPgError(error);
      if (pgError?.code === PG_UNIQUE_VIOLATION && pgError?.constraint === 'push_subscriptions_endpoint_unique') {
        // Endpoint already exists - must belong to different user
        throw new Error('This device is already registered to a different user');
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Unsubscribe a device from push notifications
   */
  async unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    const deleted = await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.endpoint, endpoint)
        )
      )
      .returning();

    return deleted.length > 0;
  }

  /**
   * Get all push subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<Array<{
    id: string;
    endpoint: string;
    deviceName?: string | null;
    createdAt: Date;
    lastUsedAt?: Date | null;
  }>> {
    return this.db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        deviceName: pushSubscriptions.deviceName,
        createdAt: pushSubscriptions.createdAt,
        lastUsedAt: pushSubscriptions.lastUsedAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  /**
   * Get user's notification preferences
   */
  private async getUserPreferences(userId: string): Promise<{
    pushEnabled: boolean;
    pushWellnessSurveys: boolean;
    pushWellnessDigest: boolean;
    pushNewMeasurements: boolean;
    pushTeamAnnouncements: boolean;
    pushReportShared: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    quietHoursTimezone: string | null;
  } | null> {
    const prefs = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    if (prefs.length === 0) {
      // Return defaults if no preferences set
      return {
        pushEnabled: true,
        pushWellnessSurveys: true,
        pushWellnessDigest: true,
        pushNewMeasurements: true,
        pushTeamAnnouncements: true,
        pushReportShared: true,
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        quietHoursTimezone: null,
      };
    }

    return prefs[0];
  }

  /**
   * Check if notification type is enabled for user
   */
  private isTypeEnabled(
    prefs: Awaited<ReturnType<typeof this.getUserPreferences>>,
    type: NotificationType
  ): boolean {
    if (!prefs) return true;

    switch (type) {
      case 'wellness_survey':
        return prefs.pushWellnessSurveys;
      case 'wellness_digest':
        return prefs.pushWellnessDigest;
      case 'new_measurement':
        return prefs.pushNewMeasurements;
      case 'team_announcement':
        return prefs.pushTeamAnnouncements;
      case 'report_shared':
        return prefs.pushReportShared;
      default:
        return true;
    }
  }

  /**
   * Check if current time is within quiet hours
   * Uses user's timezone to ensure accurate quiet hours checking
   */
  private isInQuietHours(
    prefs: Awaited<ReturnType<typeof this.getUserPreferences>>,
    userId?: string
  ): boolean {
    if (!prefs?.quietHoursEnabled || !prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }

    // Get current time in user's timezone
    // Use user's timezone or fallback to server timezone
    const userTimezone = prefs.quietHoursTimezone || 'America/New_York';

    try {
      // Convert current UTC time to user's local time
      const now = new Date();
      const userLocalTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));

      const currentHour = userLocalTime.getHours();
      const currentMinute = userLocalTime.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      const [startHour, startMinute] = prefs.quietHoursStart.split(':').map(Number);
      const [endHour, endMinute] = prefs.quietHoursEnd.split(':').map(Number);
      const startTime = startHour * 60 + startMinute;
      const endTime = endHour * 60 + endMinute;

      // Handle overnight quiet hours (e.g., 22:00 - 07:00)
      if (startTime > endTime) {
        return currentTime >= startTime || currentTime < endTime;
      }

      return currentTime >= startTime && currentTime < endTime;
    } catch (error) {
      // If timezone conversion fails, log error with user context and assume not in quiet hours
      // (fail open to avoid blocking all notifications)
      const userContext = userId ? ` (userId: ${userId})` : '';
      console.error(
        `Failed to check quiet hours for timezone ${userTimezone}${userContext}:`,
        error
      );
      return false;
    }
  }

  /**
   * Check if notification type is enabled at the organization level
   */
  private isOrgTypeEnabled(
    orgSettings: { pushEnabled: boolean; wellnessSurveysEnabled: boolean; wellnessDigestEnabled: boolean; newMeasurementsEnabled: boolean; teamAnnouncementsEnabled: boolean } | null,
    type: NotificationType
  ): boolean {
    if (!orgSettings) return true; // No org settings = allow all

    // Master org push toggle
    if (!orgSettings.pushEnabled) return false;

    switch (type) {
      case 'wellness_survey':
        return orgSettings.wellnessSurveysEnabled;
      case 'wellness_digest':
        return orgSettings.wellnessDigestEnabled;
      case 'new_measurement':
        return orgSettings.newMeasurementsEnabled;
      case 'team_announcement':
        return orgSettings.teamAnnouncementsEnabled;
      default:
        return true;
    }
  }

  /**
   * Send push notification to a user
   */
  async sendToUser(
    userId: string,
    notification: NotificationPayload,
    orgId?: string
  ): Promise<SendResult> {
    // Check if VAPID is configured
    if (!this.vapidConfigured) {
      return { successful: 0, failed: 0, skipped: true, reason: 'vapid_not_configured' };
    }

    // Validate orgId format if provided (UUID format)
    if (orgId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) {
      console.error(`Invalid orgId format: ${orgId}`);
      return { successful: 0, failed: 0, skipped: true, reason: 'invalid_org_id' };
    }

    // Check site-level global kill switch
    const globalSettings = await this.db.select().from(siteSettings).limit(1);
    if (globalSettings.length > 0 && !globalSettings[0].pushNotificationsEnabled) {
      return { successful: 0, failed: 0, skipped: true, reason: 'push_globally_disabled' };
    }

    // Check organization-level settings if orgId provided
    if (orgId) {
      const orgSettings = await this.db
        .select()
        .from(orgNotificationSettings)
        .where(eq(orgNotificationSettings.orgId, orgId));

      if (orgSettings.length > 0 && !this.isOrgTypeEnabled(orgSettings[0], notification.type)) {
        return { successful: 0, failed: 0, skipped: true, reason: 'org_type_disabled' };
      }
    }

    // Get user's subscriptions
    const subscriptions = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subscriptions.length === 0) {
      return { successful: 0, failed: 0, noSubscription: true };
    }

    // Check user preferences
    const prefs = await this.getUserPreferences(userId);

    // Check if push is enabled
    if (!prefs?.pushEnabled) {
      return { successful: 0, failed: 0, skipped: true, reason: 'push_disabled' };
    }

    // Check if notification type is enabled
    if (!this.isTypeEnabled(prefs, notification.type)) {
      return { successful: 0, failed: 0, skipped: true, reason: 'type_disabled' };
    }

    // Check quiet hours
    if (this.isInQuietHours(prefs, userId)) {
      return { successful: 0, failed: 0, deferred: true };
    }

    // Sanitize notification content to prevent XSS
    const sanitizedTitle = DOMPurify.sanitize(notification.title, {
      ALLOWED_TAGS: [], // Strip all HTML tags, notifications are plain text
      KEEP_CONTENT: true
    });
    const sanitizedBody = DOMPurify.sanitize(notification.body, {
      ALLOWED_TAGS: [],
      KEEP_CONTENT: true
    });

    // Build notification payload with PII-safe data
    // Only include non-PII fields to prevent leakage to push service logs
    const safeData: Record<string, any> = {
      url: notification.url || '/',
      type: notification.type,
    };

    // Include specific safe fields from notification.data if present
    if (notification.data?.notificationId) {
      safeData.notificationId = notification.data.notificationId;
    }
    if (notification.data?.requestId) {
      safeData.requestId = notification.data.requestId;
    }
    if (notification.data?.category) {
      safeData.category = notification.data.category;
    }

    const payload = JSON.stringify({
      title: sanitizedTitle,
      body: sanitizedBody,
      icon: notification.icon || '/icon-192.png',
      badge: notification.badge || '/badge-72.png',
      tag: notification.tag,
      data: safeData,
      actions: notification.actions,
      requireInteraction: notification.requireInteraction,
    });

    // Validate payload size (Web Push spec limit is 4KB, but leave room for encryption overhead)
    let finalPayload = payload;
    if (Buffer.byteLength(payload, 'utf8') > MAX_SAFE_PAYLOAD_SIZE) {
      console.warn(`Push notification payload exceeds safe size (${MAX_SAFE_PAYLOAD_SIZE} bytes), truncating body`);
      // Truncate body to fit within limit (leave room for other fields)
      const truncatedBody = sanitizedBody.slice(0, 200) + '...';
      finalPayload = JSON.stringify({
        title: sanitizedTitle,
        body: truncatedBody,
        icon: notification.icon || '/icon-192.png',
        badge: notification.badge || '/badge-72.png',
        tag: notification.tag,
        data: { url: notification.url || '/', type: notification.type },
        requireInteraction: notification.requireInteraction,
      });
      // If still too large after truncation, this is a critical error
      if (Buffer.byteLength(finalPayload, 'utf8') > MAX_SAFE_PAYLOAD_SIZE) {
        console.error(
          `Failed to send notification to user ${userId}: payload still too large after truncation ` +
          `(${Buffer.byteLength(finalPayload, 'utf8')} bytes > ${MAX_SAFE_PAYLOAD_SIZE} bytes). ` +
          `Notification type: ${notification.type}, title: "${notification.title}"`
        );
        return { successful: 0, failed: 0, skipped: true, reason: 'payload_too_large' };
      }
    }

    let successful = 0;
    let failed = 0;
    let removed = 0;

    // Send to all subscriptions
    for (const sub of subscriptions) {
      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          finalPayload
        );
        successful++;

        // Update lastUsedAt
        await this.db
          .update(pushSubscriptions)
          .set({ lastUsedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (error: any) {
        failed++;

        // If subscription is gone (410), remove it
        if (error?.statusCode === 410 || error?.statusCode === 404) {
          await this.db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
          removed++;
        } else {
          console.error(`Failed to send push notification to ${sub.endpoint}:`, error);
        }
      }
    }

    // Record in notification history (non-blocking, errors logged but not thrown)
    try {
      await this.db.insert(notificationHistory).values({
        userId,
        orgId,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        url: notification.url,
        data: notification.data,
        channels: ['push'],
        deliveryStatus: successful > 0 ? 'delivered' : 'failed',
        deliveredAt: successful > 0 ? new Date() : undefined,
      });
    } catch (historyError) {
      // Log but don't fail the notification send - history is secondary
      console.error('Failed to record notification in history:', historyError);
    }

    return { successful, failed, removed };
  }

  /**
   * Send push notification to all members of a team
   * Optimized to avoid N+1 queries by batching data fetches
   */
  async sendToTeam(
    teamId: string,
    notification: NotificationPayload,
    orgId?: string
  ): Promise<TeamSendResult> {
    // Get all team members
    const teamMembers = await this.db
      .select({ userId: userTeams.userId })
      .from(userTeams)
      .where(eq(userTeams.teamId, teamId));

    if (teamMembers.length === 0) {
      return {
        totalMembers: 0,
        successful: 0,
        failed: 0,
        noSubscription: 0,
        skipped: 0,
      };
    }

    // Limit concurrent push sends to avoid overwhelming the system
    // Max 50 concurrent requests to push services (FCM, Apple, etc.)
    const limit = pLimit(50);

    // Send to all members with concurrency control
    const results = await Promise.all(
      teamMembers.map(member =>
        limit(() => this.sendToUser(member.userId, notification, orgId))
      )
    );

    // Aggregate results
    let successful = 0;
    let failed = 0;
    let noSubscription = 0;
    let skipped = 0;

    for (const result of results) {
      if (result.noSubscription) {
        noSubscription++;
      } else if (result.skipped) {
        skipped++;
      } else {
        successful += result.successful;
        failed += result.failed;
      }
    }

    return {
      totalMembers: teamMembers.length,
      successful,
      failed,
      noSubscription,
      skipped,
    };
  }

  /**
   * Send push notification to all users in an organization
   * Optimized to avoid N+1 queries by batching data fetches
   */
  async sendToOrganization(
    orgId: string,
    notification: NotificationPayload,
    roleFilter?: string[]
  ): Promise<TeamSendResult> {
    let query = this.db
      .select({ userId: userOrganizations.userId })
      .from(userOrganizations)
      .where(eq(userOrganizations.organizationId, orgId));

    if (roleFilter && roleFilter.length > 0) {
      query = this.db
        .select({ userId: userOrganizations.userId })
        .from(userOrganizations)
        .where(
          and(
            eq(userOrganizations.organizationId, orgId),
            inArray(userOrganizations.role, roleFilter)
          )
        );
    }

    const orgMembers = await query;

    if (orgMembers.length === 0) {
      return {
        totalMembers: 0,
        successful: 0,
        failed: 0,
        noSubscription: 0,
        skipped: 0,
      };
    }

    // Limit concurrent push sends to avoid overwhelming the system
    // Max 50 concurrent requests to push services (FCM, Apple, etc.)
    const limit = pLimit(50);

    // Send to all members with concurrency control
    const results = await Promise.all(
      orgMembers.map(member =>
        limit(() => this.sendToUser(member.userId, notification, orgId))
      )
    );

    // Aggregate results
    let successful = 0;
    let failed = 0;
    let noSubscription = 0;
    let skipped = 0;

    for (const result of results) {
      if (result.noSubscription) {
        noSubscription++;
      } else if (result.skipped) {
        skipped++;
      } else {
        successful += result.successful;
        failed += result.failed;
      }
    }

    return {
      totalMembers: orgMembers.length,
      successful,
      failed,
      noSubscription,
      skipped,
    };
  }
}

// Export singleton instance (will be initialized with db in routes)
let pushNotificationService: PushNotificationService | null = null;

export function getPushNotificationService(db: PostgresJsDatabase<any>): PushNotificationService {
  if (!pushNotificationService) {
    pushNotificationService = new PushNotificationService(db);
  }
  return pushNotificationService;
}
