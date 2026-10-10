/**
 * The event measurement create/bulk routes only write for athletes registered on the event (approved,
 * checked_in or completed) and for metrics configured on it. Tests that write through them register their
 * athletes and configure their metrics with this helper. Both rows cascade when the event is deleted.
 */
import { db } from '../../packages/api/db';
import { eventMetrics, eventRegistrations } from '@shared/schema';

export async function allowEventEntry(eventId: string, userIds: string[], metricCodes: string[]): Promise<void> {
  if (userIds.length) {
    await db
      .insert(eventRegistrations)
      .values(userIds.map((userId) => ({ eventId, userId, userFullNameSnapshot: 'Test Athlete', status: 'approved' as const })))
      .onConflictDoNothing();
  }
  if (metricCodes.length) {
    await db
      .insert(eventMetrics)
      .values(metricCodes.map((metricCode) => ({ eventId, metricCode })))
      .onConflictDoNothing();
  }
}
