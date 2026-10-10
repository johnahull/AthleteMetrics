import { getAllDayCalendarRange } from './date-utils';

export interface IcsEventInput {
  id: string;
  name: string;
  startDate: string | Date;
  endDate?: string | Date | null;
  location?: string | null;
  description?: string | null;
}

/** RFC 5545 section 3.3.11 TEXT escaping. */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** RFC 5545 section 3.1: fold content lines longer than 75 octets (UTF-8), never inside a character. */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  // Continuation lines start with a space; that cost is accounted for by resetting octets to 1.
  const limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (octets + size > limit) {
      parts.push(current);
      current = ' ';
      octets = 1;
    }
    current += ch;
    octets += size;
  }
  parts.push(current);
  return parts.join('\r\n');
}

function formatUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Build an ICS file for an event. Event dates are calendar dates (UTC
 * midnight), so the entry is ALL-DAY (DTSTART;VALUE=DATE, exclusive DTEND).
 * @param now injectable clock for DTSTAMP (defaults to the current time)
 */
export function buildEventICS(event: IcsEventInput, now: Date = new Date()): string {
  const range = getAllDayCalendarRange(event.startDate, event.endDate);
  if (!range) return '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AthleteMetrics//Event//EN',
    'BEGIN:VEVENT',
    `UID:${event.id}@athletemetrics.app`,
    `DTSTAMP:${formatUtcStamp(now)}`,
    `DTSTART;VALUE=DATE:${range.start}`,
    `DTEND;VALUE=DATE:${range.endExclusive}`,
    `SUMMARY:${escapeIcsText(event.name)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
