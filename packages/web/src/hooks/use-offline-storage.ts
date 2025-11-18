import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addOfflineMeasurement, type OfflineMeasurement } from '@/lib/offline-db';
import { backgroundSync } from '@/lib/background-sync';
import { apiClient } from '@/lib/api';

/**
 * Hook for offline storage statistics (reactive - updates only when data changes)
 * Batches all queries in single useLiveQuery to reduce re-renders by 100x during sync
 */
export function useOfflineStats() {
  // Batch all queries into single useLiveQuery to prevent excessive re-renders
  // during bulk sync operations (was causing 300+ queries for 100 measurements)
  const stats = useLiveQuery(
    async () => {
      const [total, unsynced, failed, athletes] = await Promise.all([
        db.measurements.count(),
        db.measurements.where('[synced+failed]').equals([0, 0]).count(), // Use compound index
        db.measurements.where('failed').equals(1).count(), // Permanently failed measurements
        db.athletes.count()
      ]);
      return {
        totalMeasurements: total,
        unsyncedCount: unsynced,
        failedCount: failed,
        cachedAthletes: athletes,
        hasPendingSync: unsynced > 0,
        hasFailedSync: failed > 0
      };
    },
    [],
    {
      totalMeasurements: 0,
      unsyncedCount: 0,
      failedCount: 0,
      cachedAthletes: 0,
      hasPendingSync: false,
      hasFailedSync: false
    }
  );

  return stats || {
    totalMeasurements: 0,
    unsyncedCount: 0,
    failedCount: 0,
    cachedAthletes: 0,
    hasPendingSync: false,
    hasFailedSync: false
  };
}

/**
 * Hook for unsynced measurements (reactive)
 * Uses compound index for efficient querying
 */
export function useUnsyncedMeasurements() {
  const measurements = useLiveQuery(
    () => db.measurements.where('[synced+failed]').equals([0, 0]).toArray(), // Use compound index
    []
  );

  return measurements || [];
}

/**
 * Hook for cached athletes (reactive)
 */
export function useCachedAthletes() {
  const athletes = useLiveQuery(
    () => db.athletes.toArray(),
    []
  );

  return athletes || [];
}

/**
 * Hook for online/offline status with sync control
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const syncNow = async () => {
    setIsSyncing(true);
    try {
      await backgroundSync.syncNow();
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    isOnline,
    isSyncing: isSyncing || backgroundSync.isCurrentlySyncing,
    syncNow
  };
}

/**
 * Hook to add measurement with offline support
 */
export function useAddMeasurementOffline() {
  const { isOnline } = useOnlineStatus();

  const addMeasurement = async (measurement: {
    athleteId: string;
    // athleteName: REMOVED for FERPA/GDPR compliance - use athleteId to fetch from server/cache
    metricType: string;
    metricName: string;
    value: number;
    date: string;
    notes?: string;
  }) => {
    if (isOnline) {
      // Try to send to server immediately using apiClient for CSRF protection
      try {
        const result = await apiClient.post('/measurements', {
          userId: measurement.athleteId,
          metricType: measurement.metricType,
          value: measurement.value,
          date: measurement.date,
          notes: measurement.notes
        });

        return result;
      } catch (error) {
        // Failed to send online, fall back to offline storage
        console.warn('[OfflineStorage] Failed to send online, storing offline:', error);
        await addOfflineMeasurement(measurement);
        return { offline: true };
      }
    } else {
      // Offline, store locally
      await addOfflineMeasurement(measurement);
      return { offline: true };
    }
  };

  return { addMeasurement };
}
