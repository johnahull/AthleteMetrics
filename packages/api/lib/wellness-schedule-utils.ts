/**
 * Wellness Schedule Utilities
 *
 * Computes the next run time for recurring wellness schedules,
 * accounting for timezone, recurrence type, and end conditions.
 */

interface ScheduleConfig {
  recurrenceType: 'daily' | 'weekly' | 'custom';
  daysOfWeek: number[] | null;       // 0=Sun..6=Sat
  customIntervalDays: number | null;
  scheduledTime: string;              // HH:mm
  timezone: string;
  endDate: Date | null;
  maxOccurrences: number | null;
  occurrencesSent: number;
  /** If provided, compute next run relative to this date instead of now */
  fromDate?: Date;
}

/**
 * Compute the next run time (UTC) for a recurring schedule.
 * Returns null if end conditions are met (no more runs).
 */
export function computeNextRunAt(config: ScheduleConfig): Date | null {
  const {
    recurrenceType,
    daysOfWeek,
    customIntervalDays,
    scheduledTime,
    timezone,
    endDate,
    maxOccurrences,
    occurrencesSent,
    fromDate,
  } = config;

  // Check end conditions
  if (maxOccurrences != null && occurrencesSent >= maxOccurrences) {
    return null;
  }

  const [hours, minutes] = scheduledTime.split(':').map(Number);
  const now = fromDate || new Date();

  let candidateDate: Date;

  switch (recurrenceType) {
    case 'daily': {
      candidateDate = getNextTimeInTimezone(now, hours, minutes, timezone);
      break;
    }

    case 'weekly': {
      if (!daysOfWeek || daysOfWeek.length === 0) {
        return null;
      }
      candidateDate = getNextWeekdayTimeInTimezone(now, daysOfWeek, hours, minutes, timezone);
      break;
    }

    case 'custom': {
      if (!customIntervalDays || customIntervalDays < 1) {
        return null;
      }
      const base = new Date(now);
      base.setDate(base.getDate() + customIntervalDays);
      candidateDate = setTimeInTimezone(base, hours, minutes, timezone);
      break;
    }

    default:
      return null;
  }

  // Check if past end date
  if (endDate && candidateDate > endDate) {
    return null;
  }

  return candidateDate;
}

/**
 * Validate that a timezone string is a valid IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the next occurrence of HH:mm in the given timezone.
 * If today's time hasn't passed yet, returns today; otherwise tomorrow.
 */
function getNextTimeInTimezone(now: Date, hours: number, minutes: number, timezone: string): Date {
  const today = setTimeInTimezone(now, hours, minutes, timezone);
  if (today > now) {
    return today;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return setTimeInTimezone(tomorrow, hours, minutes, timezone);
}

/**
 * Get the next occurrence of HH:mm on one of the specified weekdays.
 * Scans up to 14 days ahead to handle the case where today is a matching day
 * but the time has already passed (need to find the same day next week).
 */
function getNextWeekdayTimeInTimezone(
  now: Date,
  daysOfWeek: number[],
  hours: number,
  minutes: number,
  timezone: string
): Date {
  const daySet = new Set(daysOfWeek);

  // Scan up to 14 days to guarantee finding the next matching weekday+time,
  // even when today is a match but the time has passed.
  for (let offset = 0; offset < 14; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);

    if (daySet.has(candidate.getDay())) {
      const time = setTimeInTimezone(candidate, hours, minutes, timezone);
      if (time > now) {
        return time;
      }
    }
  }

  // Should never reach here with valid inputs, but safe fallback
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 7);
  return setTimeInTimezone(fallback, hours, minutes, timezone);
}

/**
 * Set a specific time (hours, minutes) on a date in a given timezone,
 * returning the equivalent UTC Date.
 *
 * Algorithm:
 * 1. Get the local date components (year/month/day) for `date` in the target timezone
 * 2. Build an ISO string for that local date at the desired HH:mm
 * 3. Determine the UTC offset for that moment in the target timezone
 * 4. Return the correct UTC timestamp
 *
 * The offset is determined by comparing a known UTC moment with its
 * representation in the target timezone, using only integer arithmetic.
 */
function setTimeInTimezone(date: Date, hours: number, minutes: number, timezone: string): Date {
  // Step 1: Get the date components as they appear in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)!.value);
  const tzYear = get('year');
  const tzMonth = get('month');
  const tzDay = get('day');

  // Step 2: Build the desired local datetime string
  const pad = (n: number) => String(n).padStart(2, '0');
  const localIso = `${tzYear}-${pad(tzMonth)}-${pad(tzDay)}T${pad(hours)}:${pad(minutes)}:00`;

  // Step 3: Determine the timezone offset at this approximate moment.
  // We interpret localIso as UTC and compare with how it renders in the target timezone.
  // The difference gives us the offset.
  const probeUtc = new Date(localIso + 'Z');

  // Get what this UTC moment looks like in the target timezone
  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(probeUtc);

  const getTz = (type: string) => parseInt(tzParts.find(p => p.type === type)!.value);
  const renderedYear = getTz('year');
  const renderedMonth = getTz('month');
  const renderedDay = getTz('day');
  const renderedHour = getTz('hour') % 24; // hour12:false can return 24 for midnight in some locales
  const renderedMinute = getTz('minute');

  // Build the rendered time as a Date interpreted as UTC for comparison
  const renderedUtc = new Date(`${renderedYear}-${pad(renderedMonth)}-${pad(renderedDay)}T${pad(renderedHour)}:${pad(renderedMinute)}:00Z`);

  // Offset = how much the timezone is ahead of UTC (in ms)
  // If timezone is UTC-5, probeUtc=12:00Z renders as 07:00 local, so offset = probe - rendered = +5h
  const offsetMs = probeUtc.getTime() - renderedUtc.getTime();

  // Step 4: The desired local time in UTC = localIso_as_UTC - offset
  // Because: localTime = UTC + offset, so UTC = localTime - offset
  return new Date(probeUtc.getTime() - offsetMs);
}
