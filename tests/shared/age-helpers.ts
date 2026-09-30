/**
 * Shared date-of-birth helpers for COPPA age-boundary tests.
 *
 * IMPORTANT: use LOCAL date components (not toISOString, which is UTC). The
 * server's calculateAge parses YYYY-MM-DD as local midnight, so a UTC-formatted
 * date shifts a day at the boundary and makes an exactly-N-year-old read as N-1.
 */

/** A YYYY-MM-DD string for someone exactly `years` years old today (local time). */
export function exactlyAge(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A YYYY-MM-DD string for a minor (14 years old by default). */
export function minorBirthDate(): string {
  return exactlyAge(14);
}

/** A YYYY-MM-DD string for an adult (25 years old). */
export function adultBirthDate(): string {
  return exactlyAge(25);
}
