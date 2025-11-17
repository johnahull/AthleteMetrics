import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addOfflineMeasurement, getOfflineStats, type OfflineMeasurement } from '@/lib/offline-db';
import { backgroundSync } from '@/lib/background-sync';

/**
 * Hook for offline storage statistics
 */
export function useOfflineStats() {
  const [stats, setStats] = useState({
    totalMeasurements: 0,
    unsyncedCount: 0,
    cachedAthletes: 0,
    hasPendingSync: false
  });

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      const s = await getOfflineStats();
      if (mounted) {
        setStats(s);
      }
    }

    loadStats();

    // Refresh stats every 5 seconds
    const interval = setInterval(loadStats, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return stats;
}

/**
 * Hook for unsynced measurements (reactive)
 */
export function useUnsyncedMeasurements() {
  const measurements = useLiveQuery(
    () => db.measurements.where('synced').equals(0).toArray(),
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
    athleteName: string;
    metricType: string;
    metricName: string;
    value: number;
    date: string;
    notes?: string;
  }) => {
    if (isOnline) {
      // Try to send to server immediately
      try {
        const response = await fetch('/api/measurements', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: measurement.athleteId,
            metricType: measurement.metricType,
            value: measurement.value,
            date: measurement.date,
            notes: measurement.notes
          })
        });

        if (!response.ok) {
          throw new Error('Server error');
        }

        return await response.json();
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
