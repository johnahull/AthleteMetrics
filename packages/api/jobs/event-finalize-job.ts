/**
 * Event Finalize Job
 *
 * Handles background processing when an event is finalized:
 * 1. Sets event status to 'completed' and records finalizedAt timestamp
 * 2. If autoShareReports is enabled:
 *    a. Gets all unique athletes with measurements in this event
 *    b. Creates individual reports from the template for each athlete
 *    c. Optionally generates AI coaching insights (batched to avoid rate limits)
 *    d. Shares each report with its athlete (email + push notifications)
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  events,
  measurements,
  reports,
  reportShares,
  users,
  userOrganizations,
  notificationPreferences,
  siteSettings,
  type Report,
} from "@shared/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { emailService } from "../services/email-service";
import { getPushNotificationService } from "../services/push-notification-service";

export interface FinalizeProgress {
  status: 'processing' | 'completed' | 'failed';
  reportsGenerated: number;
  reportsSent: number;
  totalAthletes: number;
  error?: string;
}

// In-memory progress tracking (sufficient for single-process architecture)
const progressMap = new Map<string, FinalizeProgress>();

export function getFinalizeProgress(eventId: string): FinalizeProgress | null {
  return progressMap.get(eventId) ?? null;
}

/**
 * Finalize an event and optionally generate + share reports
 */
export async function finalizeEvent(
  eventId: string,
  userId: string
): Promise<{ finalized: true; reportsGenerated: number; reportsSent: number }> {
  const progress: FinalizeProgress = {
    status: 'processing',
    reportsGenerated: 0,
    reportsSent: 0,
    totalAthletes: 0,
  };
  progressMap.set(eventId, progress);

  try {
    // 1. Get the event
    const event = await storage.getEvent(eventId);
    if (!event) {
      throw new Error("Event not found");
    }
    if (event.status === 'completed') {
      throw new Error("Event is already finalized");
    }

    // 2. Mark event as completed
    await db
      .update(events)
      .set({
        status: 'completed',
        finalizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(events.id, eventId));

    // 3. If auto-share not enabled, we're done
    if (!event.autoShareReports || !event.autoShareReportTemplateId) {
      progress.status = 'completed';
      return { finalized: true, reportsGenerated: 0, reportsSent: 0 };
    }

    // 4. Get the report template
    const [template] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, event.autoShareReportTemplateId))
      .limit(1);

    if (!template) {
      console.error(`[event-finalize] Template ${event.autoShareReportTemplateId} not found for event ${eventId}`);
      progress.status = 'completed';
      return { finalized: true, reportsGenerated: 0, reportsSent: 0 };
    }

    // 5. Get all unique athletes with measurements in this event
    const athleteRows = await db
      .selectDistinct({ userId: measurements.userId })
      .from(measurements)
      .where(eq(measurements.eventId, eventId));

    const athleteIds = athleteRows
      .map((r) => r.userId)
      .filter((id): id is string => id != null);

    if (athleteIds.length === 0) {
      progress.status = 'completed';
      return { finalized: true, reportsGenerated: 0, reportsSent: 0 };
    }

    progress.totalAthletes = athleteIds.length;

    // 6. Fetch athlete details
    const athletes = await db
      .select({ id: users.id, fullName: users.fullName, emails: users.emails })
      .from(users)
      .where(inArray(users.id, athleteIds));

    const athleteMap = new Map(athletes.map((a) => [a.id, a]));

    // 7. Check if AI is available for insight generation
    const settings = await storage.getSiteSettings();
    let aiAvailable = false;
    let modelKey = "gpt-5-nano";
    if (settings?.aiModel) {
      modelKey = settings.aiModel;
      try {
        const { isModelAvailable } = await import("../services/ai-insights-service");
        const { available } = isModelAvailable(modelKey);
        aiAvailable = available;
      } catch {
        // AI service not available
      }
    }

    // 8. Create individual reports and share them, batched in groups of 5
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 2000;
    const createdReports: Array<{ report: Report; athleteId: string }> = [];

    for (let i = 0; i < athleteIds.length; i += BATCH_SIZE) {
      const batch = athleteIds.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (athleteId) => {
          try {
            const athlete = athleteMap.get(athleteId);
            if (!athlete) return;

            const templateConfig = template.config as Record<string, unknown>;

            // Create individual report from template with eventId filter
            const reportConfig = {
              ...templateConfig,
              athleteId,
              filters: {
                ...(templateConfig.filters as Record<string, unknown> || {}),
                eventId,
              },
            };

            // Remove batch fields from template config
            delete (reportConfig as Record<string, unknown>).athleteIds;

            const [report] = await db
              .insert(reports)
              .values({
                name: `${template.name} - ${athlete.fullName || 'Athlete'}`,
                organizationId: template.organizationId,
                reportType: 'individual',
                config: reportConfig,
                description: template.description,
                isTemplate: false,
                createdBy: userId,
              })
              .returning();

            createdReports.push({ report, athleteId });
            progress.reportsGenerated++;

            // Generate AI insights if available
            if (aiAvailable) {
              try {
                const { ReportService } = await import("../services/report-service");
                const reportService = new ReportService();
                const { generateCoachingInsights } = await import("../services/ai-insights-service");
                const { buildReportDataForAI } = await import("./event-finalize-helpers");

                const reportData = await buildReportDataForAI(report, userId, reportService);
                const insights = await generateCoachingInsights(modelKey as any, reportData);

                if (insights) {
                  await db
                    .update(reports)
                    .set({
                      coachingInsights: insights,
                      coachingInsightsGeneratedAt: new Date(),
                      coachingInsightsModel: modelKey,
                    })
                    .where(eq(reports.id, report.id));
                }
              } catch (aiError) {
                console.error(`[event-finalize] AI insights failed for athlete ${athleteId}:`, aiError);
                // Continue without insights — report is still valuable
              }
            }

            // Share the report with the athlete
            try {
              await db.insert(reportShares).values({
                reportId: report.id,
                athleteId,
                sharedBy: userId,
                organizationId: template.organizationId,
                message: event.autoShareMessage || null,
              });
              progress.reportsSent++;

              // Send notifications (fire-and-forget)
              sendShareNotifications(
                athleteId,
                athlete,
                report,
                template.organizationId,
                userId,
                event.autoShareMessage || undefined
              ).catch((err) =>
                console.error(`[event-finalize] Notification failed for ${athleteId}:`, err)
              );
            } catch (shareError: any) {
              if (shareError.code === '23505') {
                // Already shared — skip silently
                progress.reportsSent++;
              } else {
                console.error(`[event-finalize] Share failed for athlete ${athleteId}:`, shareError);
              }
            }
          } catch (err) {
            console.error(`[event-finalize] Failed to process athlete ${athleteId}:`, err);
          }
        })
      );

      // Delay between batches to avoid rate limits (skip after last batch)
      if (i + BATCH_SIZE < athleteIds.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    progress.status = 'completed';
    return {
      finalized: true,
      reportsGenerated: progress.reportsGenerated,
      reportsSent: progress.reportsSent,
    };
  } catch (error) {
    progress.status = 'failed';
    progress.error = error instanceof Error ? error.message : "Unknown error";
    throw error;
  }
}

/**
 * Send email + push notifications for a shared report (non-blocking)
 */
async function sendShareNotifications(
  athleteId: string,
  athlete: { fullName: string | null; emails: string[] | null },
  report: Report,
  organizationId: string,
  sharedByUserId: string,
  message?: string,
): Promise<void> {
  // Get notification preferences
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, athleteId))
    .limit(1);

  // Get coach name
  const [coach] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, sharedByUserId))
    .limit(1);

  // Get org name
  const org = await storage.getOrganization(organizationId);

  // Email notification
  const shouldEmail = prefs?.emailEnabled !== false && prefs?.emailReportShared !== false;
  if (shouldEmail && athlete.emails && athlete.emails.length > 0) {
    try {
      await emailService.sendReportSharedNotification(athlete.emails[0], {
        athleteName: athlete.fullName || 'Athlete',
        coachName: coach?.fullName || 'Your coach',
        organizationName: org?.name || 'Your organization',
        reportName: report.name,
        message,
        viewUrl: `/my-reports`,
      });
    } catch (err) {
      console.error(`[event-finalize] Email notification failed:`, err);
    }
  }

  // Push notification
  const shouldPush = prefs?.pushEnabled !== false && prefs?.pushReportShared !== false;
  if (shouldPush) {
    try {
      const pushService = getPushNotificationService(db);
      await pushService.sendToUser(
        athleteId,
        {
          type: 'report_shared',
          title: 'New Performance Report',
          body: `${coach?.fullName || 'Your coach'} shared "${report.name}" with you`,
          url: '/my-reports',
          data: { reportId: report.id },
        },
        organizationId
      );
    } catch (err) {
      console.error(`[event-finalize] Push notification failed:`, err);
    }
  }
}
