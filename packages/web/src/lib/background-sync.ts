import { getUnsyncedMeasurements, markMeasurementSynced, cleanupOldMeasurements, db } from './offline-db';

// Maximum number of retry attempts before giving up
const MAX_RETRIES = 5;

/**
 * Background sync service for offline measurements
 */
export class BackgroundSyncService {
  private syncInterval: number | null = null;
  private syncPromise: Promise<{ success: number; failed: number }> | null = null;
  private onlineHandler: (() => void) | null = null;

  /**
   * Start background sync (checks every 30 seconds)
   */
  start() {
    if (this.syncInterval) {
      return; // Already started
    }

    // Initial sync
    this.syncNow();

    // Periodic sync every 30 seconds
    this.syncInterval = window.setInterval(() => {
      this.syncNow();
    }, 30000);

    // Listen for online event
    this.onlineHandler = () => {
      console.log('[BackgroundSync] Connection restored, syncing...');
      this.syncNow();
    };
    window.addEventListener('online', this.onlineHandler);
  }

  /**
   * Stop background sync
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Remove event listener to prevent memory leak
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  /**
   * Sync all unsynced measurements now
   * Uses promise-based lock to prevent race conditions
   */
  async syncNow(): Promise<{ success: number; failed: number }> {
    // If sync is already in progress, return the existing promise
    if (this.syncPromise) {
      return this.syncPromise;
    }

    if (!navigator.onLine) {
      console.log('[BackgroundSync] Offline, skipping sync');
      return { success: 0, failed: 0 };
    }

    // Create new sync promise
    this.syncPromise = this._doSync();

    try {
      return await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  /**
   * Internal sync implementation
   */
  private async _doSync(): Promise<{ success: number; failed: number }> {
    let successCount = 0;
    let failedCount = 0;

    const unsynced = await getUnsyncedMeasurements();

    if (unsynced.length === 0) {
      return { success: 0, failed: 0 };
    }

    console.log(`[BackgroundSync] Syncing ${unsynced.length} measurements...`);

    for (const measurement of unsynced) {
      // Check if retry limit reached
      if (measurement.retryCount && measurement.retryCount >= MAX_RETRIES) {
        console.error(
          `[BackgroundSync] Max retries (${MAX_RETRIES}) reached for measurement ${measurement.id}. Marking as failed.`
        );
        // Mark as synced with a special flag to prevent further retries
        // In a production system, you might want to move this to a "failed" table
        if (measurement.id) {
          await db.measurements.update(measurement.id, {
            synced: true,
            serverId: 'FAILED_MAX_RETRIES'
          });
        }
        failedCount++;
        continue;
      }

      try {
        // Send to server
        const response = await fetch('/api/measurements', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            userId: measurement.athleteId,
            metricType: measurement.metricType,
            value: measurement.value,
            date: measurement.date,
            notes: measurement.notes
          })
        });

        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }

        const result = await response.json();

        // Mark as synced
        if (measurement.id) {
          await markMeasurementSynced(measurement.id, result.id);
          successCount++;
        }
      } catch (error) {
        console.error('[BackgroundSync] Failed to sync measurement:', error);

        // Increment retry count
        if (measurement.id) {
          await db.measurements.update(measurement.id, {
            retryCount: (measurement.retryCount || 0) + 1,
            lastRetryAt: Date.now()
          });
        }

        failedCount++;
      }
    }

    console.log(`[BackgroundSync] Sync complete: ${successCount} success, ${failedCount} failed`);

    // Cleanup old synced measurements
    await cleanupOldMeasurements();

    return { success: successCount, failed: failedCount };
  }

  /**
   * Check if currently syncing
   */
  get isCurrentlySyncing(): boolean {
    return this.syncPromise !== null;
  }
}

// Singleton instance
export const backgroundSync = new BackgroundSyncService();
