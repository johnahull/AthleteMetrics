/**
 * Wellness Scheduled Request Job
 *
 * Runs every minute to:
 * 1. Activate one-time scheduled requests whose scheduledFor time has arrived
 * 2. Process recurring wellness schedules that are due
 *
 * Follows the same pattern as wellness-digest-job.ts:
 * - node-cron every minute
 * - isRunning guard to prevent overlapping executions
 * - Graceful start/stop lifecycle
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@shared/schema';
import { wellnessRepository } from '../repositories/wellness-repository';
import { sendWellnessRequestNotifications } from '../services/wellness-notification-service';
import type { DistributionMethod } from '@shared/wellness-types';
import { storage } from '../storage';
import { WellnessAccessService } from '../auth/wellness-access';
import { computeNextRunAt } from '../lib/wellness-schedule-utils';

let scheduledTask: ScheduledTask | null = null;
let isRunning = false;
let lastRunTimestamp = 0;

// Safety margin: 55 seconds minimum between runs (cron runs every 60s)
const MIN_RUN_INTERVAL_MS = 55000;

// Recurring requests auto-expire after 24 hours to prevent stale buildup
const RECURRING_REQUEST_EXPIRY_HOURS = 24;

/**
 * Initialize and start the wellness scheduled request cron job
 */
export function startWellnessScheduledJob(
  db: PostgresJsDatabase<typeof schema>
): ScheduledTask | null {
  // Stop existing job if running
  if (scheduledTask) {
    stopWellnessScheduledJob();
  }

  scheduledTask = cron.schedule('* * * * *', async () => {
    const now = Date.now();

    // Race condition guard: prevent overlapping executions
    if (isRunning || (now - lastRunTimestamp) < MIN_RUN_INTERVAL_MS) {
      console.warn('⏭️ Skipping wellness scheduled job - previous run still active or too recent');
      return;
    }

    isRunning = true;
    lastRunTimestamp = now;

    try {
      // Phase 1: Process one-time scheduled requests
      await processScheduledRequests();

      // Phase 2: Process recurring schedules
      await processRecurringSchedules(db);
    } catch (error) {
      console.error('❌ Wellness scheduled job error:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log('✅ Wellness scheduled request job started (checking every minute)');
  return scheduledTask;
}

/**
 * Process one-time scheduled requests that are now due
 */
async function processScheduledRequests(): Promise<void> {
  const dueRequests = await wellnessRepository.getDueScheduledRequests();

  if (dueRequests.length === 0) {
    return;
  }

  console.log(`📋 Processing ${dueRequests.length} scheduled wellness request(s)...`);

  for (const request of dueRequests) {
    try {
      // Activate the request
      const activated = await wellnessRepository.activateScheduledRequest(request.id);

      // Send notifications
      if (request.requestedBy) {
        await sendWellnessRequestNotifications(
          activated,
          {
            templateId: request.templateId,
            distributionMethod: request.distributionMethod as DistributionMethod,
            targetAthleteIds: request.targetAthleteIds || undefined,
            targetTeamIds: request.targetTeamIds || undefined,
            expiresAt: request.expiresAt || undefined,
          },
          request.requestedBy,
          request.organizationId
        );
      }

      console.log(`  ✅ Activated scheduled request ${request.id}`);
    } catch (error) {
      console.error(`  ❌ Failed to activate scheduled request ${request.id}:`, error);
    }
  }
}

/**
 * Process recurring wellness schedules that are due.
 * For each due schedule: create a new wellness request, send notifications,
 * increment occurrences, compute next run time.
 */
async function processRecurringSchedules(
  _db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  const dueSchedules = await wellnessRepository.getSchedulesDueNow();

  if (dueSchedules.length === 0) {
    return;
  }

  console.log(`🔄 Processing ${dueSchedules.length} recurring wellness schedule(s)...`);

  for (const schedule of dueSchedules) {
    try {
      // Generate a public token for the new request
      const publicToken = WellnessAccessService.generateMagicLinkToken();

      // Create a new wellness request from the schedule.
      // Set expiresAt so recurring requests don't stay open indefinitely.
      const expiresAt = new Date(Date.now() + RECURRING_REQUEST_EXPIRY_HOURS * 60 * 60 * 1000);

      const request = await storage.createWellnessRequest({
        organizationId: schedule.organizationId,
        templateId: schedule.templateId,
        requestedBy: schedule.createdBy,
        distributionMethod: schedule.distributionMethod,
        targetAthleteIds: schedule.targetAthleteIds || [],
        targetTeamIds: schedule.targetTeamIds || [],
        publicToken,
        requiresAuth: schedule.requiresAuth,
        status: 'active',
        expiresAt,
      });

      // Send notifications
      await sendWellnessRequestNotifications(
        request,
        {
          templateId: schedule.templateId,
          distributionMethod: schedule.distributionMethod as DistributionMethod,
          targetAthleteIds: schedule.targetAthleteIds || undefined,
          targetTeamIds: schedule.targetTeamIds || undefined,
          expiresAt: expiresAt.toISOString(),
        },
        schedule.createdBy,
        schedule.organizationId
      );

      // Compute next run
      const newOccurrencesSent = schedule.occurrencesSent + 1;
      const nextRunAt = computeNextRunAt({
        recurrenceType: schedule.recurrenceType,
        daysOfWeek: schedule.daysOfWeek,
        customIntervalDays: schedule.customIntervalDays,
        scheduledTime: schedule.scheduledTime,
        timezone: schedule.timezone,
        endDate: schedule.endDate,
        maxOccurrences: schedule.maxOccurrences,
        occurrencesSent: newOccurrencesSent,
      });

      await wellnessRepository.updateScheduleAfterRun(
        schedule.id,
        nextRunAt,
        newOccurrencesSent
      );

      console.log(`  ✅ Schedule ${schedule.id}: created request, occurrence #${newOccurrencesSent}${nextRunAt ? `, next run: ${nextRunAt.toISOString()}` : ' (completed)'}`);
    } catch (error) {
      console.error(`  ❌ Failed to process schedule ${schedule.id}:`, error);
    }
  }
}

/**
 * Stop the wellness scheduled request cron job
 */
export function stopWellnessScheduledJob(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('⏹️ Wellness scheduled request job stopped');
  }
}

/**
 * Check if the job is currently running
 */
export function isScheduledJobRunning(): boolean {
  return isRunning;
}
