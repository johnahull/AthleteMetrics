/**
 * Push Notification Service
 * Handles all Web Push notification operations using web-push library
 */

import webPush from 'web-push';
import { eq, and, inArray } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  pushSubscriptions,
  notificationPreferences,
  notificationHistory,
  orgNotificationSettings,
  userTeams,
  NotificationType,
} from '@shared/schema';

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

    if (publicKey && privateKey) {
      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
    } else {
      console.warn('⚠️ VAPID keys not configured - push notifications disabled');
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
    // Check if subscription already exists
    const existing = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

    if (existing.length > 0) {
      // Update lastUsedAt for existing subscription
      const updated = await this.db
        .update(pushSubscriptions)
        .set({ lastUsedAt: new Date() })
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
        .returning();
      return updated[0];
    }

    // Create new subscription
    const [result] = await this.db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        deviceName,
        userAgent,
      })
      .returning();

    return result;
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
      default:
        return true;
    }
  }

  /**
   * Check if current time is within quiet hours
   */
  private isInQuietHours(
    prefs: Awaited<ReturnType<typeof this.getUserPreferences>>
  ): boolean {
    if (!prefs?.quietHoursEnabled || !prefs.quietHoursStart || !prefs.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
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
  }

  /**
   * Send push notification to a user
   */
  async sendToUser(
    userId: string,
    notification: NotificationPayload,
    orgId?: string
  ): Promise<SendResult> {
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
    if (this.isInQuietHours(prefs)) {
      return { successful: 0, failed: 0, deferred: true };
    }

    // Build notification payload
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || '/icon-192.png',
      badge: notification.badge || '/badge-72.png',
      tag: notification.tag,
      data: {
        url: notification.url || '/',
        type: notification.type,
        ...notification.data,
      },
      actions: notification.actions,
      requireInteraction: notification.requireInteraction,
    });

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
          payload
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

    // Record in notification history
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

    return { successful, failed, removed };
  }

  /**
   * Send push notification to all members of a team
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

    let successful = 0;
    let failed = 0;
    let noSubscription = 0;
    let skipped = 0;

    for (const member of teamMembers) {
      const result = await this.sendToUser(member.userId, notification, orgId);

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
   */
  async sendToOrganization(
    orgId: string,
    notification: NotificationPayload,
    roleFilter?: string[]
  ): Promise<TeamSendResult> {
    // Import here to avoid circular dependencies
    const { userOrganizations } = await import('@shared/schema');

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

    let successful = 0;
    let failed = 0;
    let noSubscription = 0;
    let skipped = 0;

    for (const member of orgMembers) {
      const result = await this.sendToUser(member.userId, notification, orgId);

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
