/**
 * Wellness Notification Service
 *
 * Extracted from wellness-routes.ts to allow both the POST handler (immediate sends)
 * and the scheduled cron job to send notifications through the same code path.
 */

import { storage } from "../storage";
import { db } from "../db";
import { emailService } from "./email-service";
import { WellnessAccessService } from "../auth/wellness-access";
import { getPushNotificationService } from "./push-notification-service";
import type { NotificationPayload } from "./push-notification-service";
import { WELLNESS_CONSTANTS } from "@shared/wellness-constants";
import type { DistributionMethod } from "@shared/wellness-types";

export interface EmailNotificationResults {
  sent: number;
  failed: number;
  errors: Array<{ athleteName: string; email: string; error: string }>;
}

export interface PushNotificationResults {
  sent: number;
  failed: number;
  noSubscription: number;
  skipped: number;
  errors: Array<{ athleteName: string; reason: string }>;
}

export interface NotificationResults {
  emailNotifications?: EmailNotificationResults;
  pushNotifications?: PushNotificationResults;
}

/**
 * Send all notifications (email + push) for a wellness request.
 * Used by both the immediate POST handler and the scheduled job.
 */
export async function sendWellnessRequestNotifications(
  request: { id: string; publicToken: string | null },
  data: {
    templateId: string;
    distributionMethod: DistributionMethod;
    targetAthleteIds?: string[];
    targetTeamIds?: string[];
    expiresAt?: Date | string;
  },
  requestedByUserId: string,
  organizationId: string
): Promise<NotificationResults> {
  const results: NotificationResults = {};

  // Send email notifications for magic link distribution
  const emailResults: EmailNotificationResults = {
    sent: 0,
    failed: 0,
    errors: [],
  };

  if (data.distributionMethod === 'magic_link' && request.publicToken) {
    try {
      const magicLinks = await WellnessAccessService.generateMagicLinksForRequest(request.id);
      const template = await storage.getWellnessTemplate(data.templateId);
      const coach = await storage.getUser(requestedByUserId);
      const organization = await storage.getOrganization(organizationId);

      const expiryDays = data.expiresAt
        ? Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 7;

      const athleteIds = Array.from(magicLinks.keys());
      const athletes = await storage.getUsersByIds(athleteIds);
      const athleteMap = new Map(athletes.map(a => [a.id, a]));

      for (const [athleteId, magicLink] of magicLinks.entries()) {
        const athlete = athleteMap.get(athleteId);
        if (athlete && athlete.emails && athlete.emails.length > 0) {
          try {
            await emailService.sendWellnessRequest(athlete.emails[0], {
              athleteName: athlete.fullName,
              coachName: coach!.fullName,
              organizationName: organization!.name,
              magicLink,
              expiryDays,
              templateName: template!.name,
              estimatedMinutes: ((template!.config as any).questions?.length || WELLNESS_CONSTANTS.DEFAULT_QUESTION_COUNT) * WELLNESS_CONSTANTS.MINUTES_PER_QUESTION,
            });
            emailResults.sent++;
          } catch (emailError) {
            console.error(`Failed to send email to ${athlete.emails[0]}:`, emailError);
            emailResults.failed++;
            emailResults.errors.push({
              athleteName: athlete.fullName,
              email: athlete.emails[0],
              error: (emailError as Error).message,
            });
          }
        }
      }
    } catch (emailError) {
      console.error("Failed to generate magic links:", emailError);
    }
  }

  if (data.distributionMethod === 'magic_link') {
    results.emailNotifications = emailResults;
  }

  // Send push notifications for magic_link and athlete_account distribution
  const pushResults: PushNotificationResults = {
    sent: 0,
    failed: 0,
    noSubscription: 0,
    skipped: 0,
    errors: [],
  };

  const shouldSendPush = data.distributionMethod === 'magic_link' || data.distributionMethod === 'athlete_account';

  if (shouldSendPush) {
    try {
      const pushService = getPushNotificationService(db);
      const template = await storage.getWellnessTemplate(data.templateId);
      const coach = await storage.getUser(requestedByUserId);

      let magicLinks: Map<string, string> | null = null;
      if (data.distributionMethod === 'magic_link') {
        magicLinks = await WellnessAccessService.generateMagicLinksForRequest(request.id);
      }

      const athleteIds = magicLinks
        ? Array.from(magicLinks.keys())
        : (data.targetAthleteIds || []);

      const athletes = await storage.getUsersByIds(athleteIds);
      const athleteMap = new Map(athletes.map(a => [a.id, a]));

      const appUrl = process.env.APP_URL || 'https://athletemetrics.app';
      const athleteAccountUrl = `${appUrl}/wellness-my-requests`;

      for (const athleteId of athleteIds) {
        const athlete = athleteMap.get(athleteId);
        if (athlete) {
          try {
            const notificationUrl = magicLinks?.get(athleteId) || athleteAccountUrl;

            const notification: NotificationPayload = {
              title: 'New Wellness Check',
              body: `${coach!.fullName} sent you a wellness questionnaire`,
              url: notificationUrl,
              type: 'wellness_survey',
              tag: `wellness-${request.id}`,
              data: {
                requestId: request.id,
                templateName: template!.name,
                coachName: coach!.fullName,
              },
              actions: [
                { action: 'open', title: 'Start Now' },
                { action: 'later', title: 'Remind Later' },
              ],
              requireInteraction: true,
            };

            const result = await pushService.sendToUser(
              athleteId,
              notification,
              organizationId
            );

            if (result.noSubscription) {
              pushResults.noSubscription++;
            } else if (result.skipped) {
              pushResults.skipped++;
              pushResults.errors.push({
                athleteName: athlete.fullName,
                reason: result.reason || 'skipped',
              });
            } else if (result.successful > 0) {
              pushResults.sent++;
            } else if (result.failed > 0) {
              pushResults.failed++;
              pushResults.errors.push({
                athleteName: athlete.fullName,
                reason: 'delivery_failed',
              });
            }
          } catch (pushError) {
            console.error(`Failed to send push to ${athlete.fullName}:`, pushError);
            pushResults.failed++;
            pushResults.errors.push({
              athleteName: athlete.fullName,
              reason: (pushError as Error).message,
            });
          }
        }
      }
    } catch (pushError) {
      console.error("Failed to send push notifications:", pushError);
    }
  }

  if (shouldSendPush) {
    results.pushNotifications = pushResults;
  }

  return results;
}
