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
  }
}

// Singleton instance
export const db = new OfflineDatabase();

/**
 * Add measurement to offline queue
 */
export async function addOfflineMeasurement(measurement: Omit<OfflineMeasurement, 'id' | 'synced' | 'createdAt'>) {
  return await db.measurements.add({
    ...measurement,
    synced: false,
    createdAt: Date.now()
  });
}

/**
 * Get all unsynced measurements
 */
export async function getUnsyncedMeasurements(): Promise<OfflineMeasurement[]> {
  return await db.measurements
    .where('synced')
    .equals(0) // false = 0 in IndexedDB
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
