/**
 * Measurement Notification Service
 * Notifies athletes when a coach/admin records a measurement for them
 */

import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { users, siteMetrics, notificationPreferences } from '@shared/schema';
import { db } from '../db';
import { getPushNotificationService } from './push-notification-service';
import { emailService } from './email-service';

interface NotifyNewMeasurementData {
  measurementId: string;
  userId: string;       // athlete whose measurement was recorded
  submittedBy: string;  // coach/admin who entered it
  metric: string;
  value: string;
  units: string;
  organizationId: string | null;
  date: string;
}

/**
 * Notify an athlete that a new measurement was recorded for them.
 * Sends push notification and (if opted in) email.
 *
 * Skips notification for:
 * - Self-entries (submittedBy === userId)
 * - Personal measurements (no organizationId)
 * - Athletes not found in DB
 *
 * All errors are caught and logged — never throws.
 */
export async function notifyNewMeasurement(data: NotifyNewMeasurementData): Promise<void> {
  try {
    // Skip self-entries
    if (data.submittedBy === data.userId) return;

    // Skip non-org measurements
    if (!data.organizationId) return;

    // Parallel DB lookups for athlete, submitter, metric config, and email prefs
    const [athleteResult, submitterResult, metricResult, prefsResult] = await Promise.all([
      db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, emails: users.emails })
        .from(users).where(eq(users.id, data.userId)),
      db.select({ id: users.id, fullName: users.fullName })
        .from(users).where(eq(users.id, data.submittedBy)),
      db.select({ label: siteMetrics.label })
        .from(siteMetrics).where(eq(siteMetrics.code, data.metric)),
      db.select({ emailNewMeasurements: notificationPreferences.emailNewMeasurements })
        .from(notificationPreferences).where(eq(notificationPreferences.userId, data.userId)),
    ]);

    const athlete = athleteResult[0];
    if (!athlete) return;

    const submitterName = submitterResult[0]?.fullName || 'A coach';
    const metricLabel = metricResult[0]?.label || data.metric;
    const emailOptIn = prefsResult[0]?.emailNewMeasurements ?? false;

    // Send push notification
    try {
      const pushService = getPushNotificationService(db as PostgresJsDatabase<any>);
      await pushService.sendToUser(
        data.userId,
        {
          title: 'New Measurement Recorded',
          body: `${submitterName} recorded your ${metricLabel}: ${data.value} ${data.units}`,
          type: 'new_measurement',
          url: '/my-measurements',
        },
        data.organizationId
      );
    } catch (pushError) {
      console.error('Failed to send measurement push notification:', pushError);
    }

    // Send email if opted in
    const athleteEmail = athlete.emails?.[0];
    if (emailOptIn && athleteEmail) {
      try {
        await emailService.sendNewMeasurementNotification(athleteEmail, {
          athleteName: athlete.firstName,
          submitterName,
          metricLabel,
          value: data.value,
          units: data.units,
          date: data.date,
        });
      } catch (emailError) {
        console.error('Failed to send measurement email notification:', emailError);
      }
    }
  } catch (error) {
    console.error('Failed to process measurement notification:', error);
  }
}
