import { getAllDayCalendarRange } from './date-utils';

export interface IcsEventInput {
  id: string;
  name: string;
  startDate: string | Date;
  endDate?: string | Date | null;
  location?: string | null;
  description?: string | null;
}

/**
 * Build an ICS file for an event. Event dates are calendar dates (UTC
 * midnight), so the entry is ALL-DAY (DTSTART;VALUE=DATE, exclusive DTEND).
 */
export function buildEventICS(event: IcsEventInput): string {
  const range = getAllDayCalendarRange(event.startDate, event.endDate);
  if (!range) return '';
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AthleteMetrics//Event//EN
BEGIN:VEVENT
UID:${event.id}@athletemetrics.app
DTSTART;VALUE=DATE:${range.start}
DTEND;VALUE=DATE:${range.endExclusive}
SUMMARY:${event.name}
LOCATION:${event.location || ""}
DESCRIPTION:${event.description?.replace(/\n/g, "\\n") || ""}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
}
