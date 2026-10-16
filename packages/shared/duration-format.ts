/**
 * Duration (mm:ss) parsing and formatting. Values are always stored as seconds;
 * only input and display use mm:ss.
 */

export type DisplayFormat = 'decimal' | 'duration';

/** Duration metrics are stored in seconds, so their unit must be 's'. */
export const DURATION_UNIT_ERROR = "Unit 's' is required for duration (mm:ss) metrics";

/** True when a metric (the existing row merged with a patch) is duration with a unit other than 's'. */
export function violatesDurationUnit(metric: { unit?: string | null; displayFormat?: DisplayFormat | null }): boolean {
  return metric.displayFormat === 'duration' && metric.unit !== 's';
}

const PLAIN_SECONDS = /^\d+(\.\d+)?$/;
const MIN_SEC = /^(\d+):([0-5]\d)(\.\d+)?$/;
const HOUR_MIN_SEC = /^(\d+):([0-5]\d):([0-5]\d)(\.\d+)?$/;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Seconds from "402.5", "6:42.5" or "1:00:05"; null when empty or not a valid time. Plain seconds must be digits or D.D (".5" is rejected). */
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

/** m:ss with up to 3 decimals and no trailing zeros (402.5 -> "6:42.5", 435 -> "7:15"), for editing: never rounds a stored value */
export function formatDurationExact(seconds: number): string {
  return formatDuration(seconds, 3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
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

const DURATION_TICK_STEPS = [5, 10, 15, 30, 60, 300];

/** Axis step in seconds for a duration chart, so ticks land on round mm:ss values (0:30, 1:00, 5:00). */
export function durationTickStep(rangeSeconds: number, maxTicks = 6): number {
  const step = DURATION_TICK_STEPS.find((s) => rangeSeconds / s <= maxTicks);
  return step ?? 300 * Math.ceil(rangeSeconds / (300 * maxTicks));
}
