/**
 * Event dates are CALENDAR dates stored as UTC midnight. Format them in UTC so
 * the printed day does not depend on the server's timezone.
 */
export function formatCalendarDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC' });
}
