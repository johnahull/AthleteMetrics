import Dexie, { Table } from 'dexie';

/**
 * Offline measurement data for background sync
 */
export interface OfflineMeasurement {
  id?: number; // Auto-incremented local ID
  athleteId: string;
  athleteName: string;
  metricType: string;
  metricName: string;
  value: number;
  date: string;
  notes?: string;
  synced: boolean; // Whether synced to server
  createdAt: number; // Timestamp
  serverId?: string; // Server-assigned ID after sync
  retryCount?: number; // Number of sync attempts
  lastRetryAt?: number; // Timestamp of last retry attempt
  failed?: boolean; // Whether sync permanently failed
  failureReason?: string; // Reason for permanent failure
}

/**
 * Offline athlete cache for quick access
 */
export interface OfflineAthlete {
  id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  teamName?: string;
  teamId?: string;
  cachedAt: number;
}

/**
 * Dexie database for offline storage
 */
export class OfflineDatabase extends Dexie {
  measurements!: Table<OfflineMeasurement, number>;
  athletes!: Table<OfflineAthlete, string>;

  constructor() {
    super('AthleteMetricsOffline');

    this.version(1).stores({
      measurements: '++id, athleteId, synced, createdAt, serverId',
      athletes: 'id, cachedAt'
    });

    // Version 2: Add retry tracking fields
    this.version(2).stores({
      measurements: '++id, athleteId, synced, createdAt, serverId, retryCount',
      athletes: 'id, cachedAt'
    });

    // Version 3: Add failed field for permanently failed measurements
    this.version(3).stores({
      measurements: '++id, athleteId, synced, createdAt, serverId, retryCount, failed',
      athletes: 'id, cachedAt'
    });
  }
}

// Singleton instance
export const db = new OfflineDatabase();

/**
 * Check storage quota
 */
export async function checkStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
  hasSpace: boolean;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;

    return {
      usage,
      quota,
      percentUsed,
      hasSpace: percentUsed < 90
    };
  }

  return {
    usage: 0,
    quota: 0,
    percentUsed: 0,
    hasSpace: true
  };
}

/**
 * Add measurement to offline queue
 */
export async function addOfflineMeasurement(measurement: Omit<OfflineMeasurement, 'id' | 'synced' | 'createdAt'>) {
  const quota = await checkStorageQuota();

  if (!quota.hasSpace) {
    throw new Error('Storage quota exceeded. Please sync or clear old data.');
  }

  try {
    return await db.measurements.add({
      ...measurement,
      synced: false,
      createdAt: Date.now()
    });
  } catch (error: any) {
    if (error.name === 'QuotaExceededError') {
      await cleanupOldMeasurements();
      return await db.measurements.add({
        ...measurement,
        synced: false,
        createdAt: Date.now()
      });
    }
    throw error;
  }
}

/**
 * Get all unsynced measurements (excluding permanently failed ones)
 */
export async function getUnsyncedMeasurements(): Promise<OfflineMeasurement[]> {
  return await db.measurements
    .where('synced')
    .equals(0) // false = 0 in IndexedDB
    .filter(m => !m.failed) // Exclude permanently failed measurements
    .toArray();
}

/**
 * Mark measurement as synced
 */
export async function markMeasurementSynced(localId: number, serverId: string) {
  await db.measurements.update(localId, {
    synced: true,
    serverId
  });
}

/**
 * Delete synced measurements older than 7 days
 */
export async function cleanupOldMeasurements() {
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  await db.measurements
    .where('synced')
    .equals(1) // true = 1 in IndexedDB
    .and(m => m.createdAt < weekAgo)
    .delete();
}

/**
 * Cache athlete data for offline access
 */
export async function cacheAthlete(athlete: Omit<OfflineAthlete, 'cachedAt'>) {
  await db.athletes.put({
    ...athlete,
    cachedAt: Date.now()
  });
}

/**
 * Get cached athletes
 */
export async function getCachedAthletes(): Promise<OfflineAthlete[]> {
  return await db.athletes.toArray();
}

/**
 * Clear all offline data
 */
export async function clearOfflineData() {
  await db.measurements.clear();
  await db.athletes.clear();
}

/**
 * Get offline storage stats
 */
export async function getOfflineStats() {
  const totalMeasurements = await db.measurements.count();
  const unsyncedCount = await db.measurements.where('synced').equals(0).count();
  const cachedAthletes = await db.athletes.count();

  return {
    totalMeasurements,
    unsyncedCount,
    cachedAthletes,
    hasPendingSync: unsyncedCount > 0
  };
}
