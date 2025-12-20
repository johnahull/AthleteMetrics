/**
 * Wellness Digest Scheduled Job
 *
 * Runs every minute to check which organizations should receive their daily
 * wellness digest based on their configured digest time and timezone.
 *
 * The job:
 * 1. Checks if global push notifications are enabled
 * 2. Gets all organizations that should receive digests at the current time
 * 3. Sends digest notifications to coaches in those organizations
 *
 * Uses node-cron for scheduling and respects organization settings for:
 * - Digest delivery time (default: 07:00)
 * - Timezone (default: America/New_York)
 * - Skip weekends option
 */

import cron, { type ScheduledTask } from 'node-cron';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@shared/schema';
import { getWellnessDigestService } from '../services/wellness-digest-service';

interface DigestJobConfig {
  enabled: boolean;
  cronExpression: string;
}

// Default configuration
const DEFAULT_CONFIG: DigestJobConfig = {
  enabled: true,
  cronExpression: '* * * * *', // Run every minute to check org-specific times
};

let scheduledTask: ScheduledTask | null = null;
let isRunning = false;

/**
 * Initialize and start the wellness digest cron job
 */
export function startWellnessDigestJob(
  db: PostgresJsDatabase<typeof schema>,
  config: Partial<DigestJobConfig> = {}
): ScheduledTask | null {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    console.log('⏸️ Wellness digest job is disabled');
    return null;
  }

  // Stop existing job if running
  if (scheduledTask) {
    stopWellnessDigestJob();
  }

  const digestService = getWellnessDigestService(db);

  scheduledTask = cron.schedule(finalConfig.cronExpression, async () => {
    // Prevent overlapping runs
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      // Check global kill switch
      const globalEnabled = await digestService.isGlobalPushEnabled();
      if (!globalEnabled) {
        return;
      }

      // Get organizations that should receive digests now
      const orgs = await digestService.getOrganizationsForDigest();

      if (orgs.length === 0) {
        return;
      }

      console.log(`📬 Sending wellness digests to ${orgs.length} organizations...`);

      // Process each organization
      for (const org of orgs) {
        try {
          const result = await digestService.sendDigest(org.orgId);

          if (result.atRiskCount > 0) {
            console.log(
              `  ✅ ${org.orgName}: ${result.atRiskCount} at-risk (${result.redCount} red, ${result.yellowCount} yellow), ` +
              `sent to ${result.coachesSent} coaches, ${result.coachesFailed} failed`
            );
          } else {
            console.log(`  ✅ ${org.orgName}: No at-risk athletes, digest skipped`);
          }
        } catch (error) {
          console.error(`  ❌ Failed to send digest for ${org.orgName}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Wellness digest job error:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log('✅ Wellness digest job started (checking every minute)');
  return scheduledTask;
}

/**
 * Stop the wellness digest cron job
 */
export function stopWellnessDigestJob(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('⏹️ Wellness digest job stopped');
  }
}

/**
 * Check if the job is currently running
 */
export function isJobRunning(): boolean {
  return isRunning;
}

/**
 * Manually trigger digest for a specific organization (for testing)
 */
export async function triggerDigestForOrg(
  db: PostgresJsDatabase<typeof schema>,
  orgId: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  const digestService = getWellnessDigestService(db);

  try {
    const result = await digestService.sendDigest(orgId);
    return { success: true, result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Get current job status for monitoring
 */
export function getJobStatus(): {
  scheduled: boolean;
  running: boolean;
  nextExecution: Date | null;
} {
  return {
    scheduled: scheduledTask !== null,
    running: isRunning,
    nextExecution: null, // node-cron doesn't expose next execution time easily
  };
}
