/**
 * Event dates are CALENDAR dates stored as UTC midnight. Format them in UTC so
 * the printed day does not depend on the server's timezone.
 */
export function formatCalendarDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-US', { timeZone: 'UTC' });
}

/** Timeframe text for report prompts: "<start> to <end>" for a custom range, else the default label. */
export function formatEventReportTimeframe(
  startDate?: string | Date | null,
  endDate?: string | Date | null
): string {
  if (startDate && endDate) {
    return `${formatCalendarDate(startDate)} to ${formatCalendarDate(endDate)}`;
  }
  return 'Current Season';
}
