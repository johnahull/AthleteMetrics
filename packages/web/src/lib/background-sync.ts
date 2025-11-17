import { getUnsyncedMeasurements, markMeasurementSynced, cleanupOldMeasurements, db } from './offline-db';

// Maximum number of retry attempts before giving up
const MAX_RETRIES = 5;

// Sync interval: 5 minutes (reduced from 30s to prevent battery drain)
// This balances timely sync with battery/CPU efficiency
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Background sync service for offline measurements
 */
export class BackgroundSyncService {
  private syncInterval: number | null = null;
  private syncPromise: Promise<{ success: number; failed: number }> | null = null;
  private onlineHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  /**
   * Start background sync (checks every 5 minutes when visible)
   */
  start() {
    if (this.syncInterval) {
      return; // Already started
    }

    // Initial sync
    this.syncNow();

    // Periodic sync every 5 minutes - but only if page is visible and online
    this.syncInterval = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) {
        this.syncNow();
      }
    }, SYNC_INTERVAL_MS);

    // Listen for online event
    this.onlineHandler = () => {
      console.log('[BackgroundSync] Connection restored, syncing...');
      this.syncNow();
    };
    window.addEventListener('online', this.onlineHandler);

    // Listen for visibility change - sync when tab becomes visible (if online)
    this.visibilityHandler = () => {
      if (!document.hidden && navigator.onLine) {
        console.log('[BackgroundSync] Tab became visible, syncing...');
        this.syncNow();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Stop background sync
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Remove event listeners to prevent memory leaks
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
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
          `[BackgroundSync] Max retries (${MAX_RETRIES}) reached for measurement ${measurement.id}. Marking as permanently failed.`
        );
        // Mark as permanently failed (but NOT synced) to prevent data loss confusion
        if (measurement.id) {
          await db.measurements.update(measurement.id, {
            failed: true,
            failureReason: `Maximum retry attempts (${MAX_RETRIES}) exceeded`,
            synced: false  // Keep as unsynced so user knows data is not on server
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
