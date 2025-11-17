import { getUnsyncedMeasurements, markMeasurementSynced, cleanupOldMeasurements } from './offline-db';

/**
 * Background sync service for offline measurements
 */
export class BackgroundSyncService {
  private syncInterval: number | null = null;
  private isSyncing = false;
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
   */
  async syncNow(): Promise<{ success: number; failed: number }> {
    if (this.isSyncing) {
      console.log('[BackgroundSync] Sync already in progress, skipping...');
      return { success: 0, failed: 0 };
    }

    if (!navigator.onLine) {
      console.log('[BackgroundSync] Offline, skipping sync');
      return { success: 0, failed: 0 };
    }

    this.isSyncing = true;
    let successCount = 0;
    let failedCount = 0;

    try {
      const unsynced = await getUnsyncedMeasurements();

      if (unsynced.length === 0) {
        return { success: 0, failed: 0 };
      }

      console.log(`[BackgroundSync] Syncing ${unsynced.length} measurements...`);

      for (const measurement of unsynced) {
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
          failedCount++;
        }
      }

      console.log(`[BackgroundSync] Sync complete: ${successCount} success, ${failedCount} failed`);

      // Cleanup old synced measurements
      await cleanupOldMeasurements();

      return { success: successCount, failed: failedCount };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Check if currently syncing
   */
  get isCurrentlySyncing(): boolean {
    return this.isSyncing;
  }
}

// Singleton instance
export const backgroundSync = new BackgroundSyncService();
