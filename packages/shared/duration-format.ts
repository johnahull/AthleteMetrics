/**
 * Duration (mm:ss) parsing and formatting. Values are always stored as seconds;
 * only input and display use mm:ss.
 */

export type DisplayFormat = 'decimal' | 'duration';

const PLAIN_SECONDS = /^\d+(\.\d+)?$/;
const MIN_SEC = /^(\d+):([0-5]\d)(\.\d+)?$/;
const HOUR_MIN_SEC = /^(\d+):([0-5]\d):([0-5]\d)(\.\d+)?$/;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Seconds from "402.5", "6:42.5" or "1:00:05"; null when empty or not a valid time. */
export function parseDuration(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (PLAIN_SECONDS.test(text)) return round3(Number(text));

  const hms = HOUR_MIN_SEC.exec(text);
  if (hms) return round3(Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]) + Number(hms[4] ?? 0));

  const ms = MIN_SEC.exec(text);
  if (ms) return round3(Number(ms[1]) * 60 + Number(ms[2]) + Number(ms[3] ?? 0));

  return null;
}

/** "6:42.5" (or "1:00:05.0" from an hour up). Rounds before splitting so 59.996 never prints as 0:60.00. */
export function formatDuration(seconds: number, decimals: number): string {
  if (!Number.isFinite(seconds)) return '';
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(seconds) * factor) / factor;
  const sign = seconds < 0 && rounded > 0 ? '-' : '';

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded - hours * 3600 - minutes * 60;
  const secText = secs.toFixed(decimals).padStart(decimals > 0 ? decimals + 3 : 2, '0');

  return hours > 0
    ? `${sign}${hours}:${String(minutes).padStart(2, '0')}:${secText}`
    : `${sign}${minutes}:${secText}`;
}

export interface MeasurementFormat {
  unit?: string | null;
  displayFormat?: DisplayFormat | null;
  decimalPrecision?: number | null;
}

/** A value ready to show: mm:ss for duration metrics, otherwise the number with its unit. */
export function formatMeasurement(value: number, format: MeasurementFormat): string {
  const decimals = format.decimalPrecision ?? 1;
  if (format.displayFormat === 'duration') return formatDuration(value, decimals);
  const text = value.toFixed(decimals);
  if (!format.unit) return text;
  return format.unit === '%' ? `${text}%` : `${text} ${format.unit}`;
}

/** An imported cell as seconds: mm:ss when it has a colon, otherwise the lenient parseFloat imports always used. Null when unusable. */
export function parseImportValue(raw: string): number | null {
  const text = String(raw).trim();
  if (text.includes(':')) return parseDuration(text);
  const n = parseFloat(text);
  return Number.isNaN(n) ? null : n;
}
