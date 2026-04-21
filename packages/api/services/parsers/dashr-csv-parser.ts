/**
 * Dashr CSV Parser
 *
 * Parses Dashr timing gate CSV exports into structured import data.
 * Handles multi-session CSVs, split extraction, drill type mapping,
 * best-attempt selection, and outlier detection.
 */

import * as iconv from 'iconv-lite';
import { MetricType } from '@shared/schema/constants';
import type {
  DeviceImportParser,
  ParsedImportData,
  ParsedSessionData,
  ParsedAthleteResult,
  ParsedDrillResult,
  ParsedSplit,
} from './types';

// Required columns that must exist for a valid Dashr CSV
const REQUIRED_COLUMNS = ['Date', 'First Name', 'Last Name', 'Type', 'Final Time'];

// Outlier ranges: values outside these bounds are flagged
const OUTLIER_RANGES: Record<string, { min: number; max: number; label: string }> = {
  DASH_5YD: { min: 0.8, max: 2.5, label: '5yd split' },
  DASH_10YD: { min: 1.0, max: 4.0, label: '10yd dash' },
  DASH_20YD: { min: 2.0, max: 6.0, label: '20yd dash' },
  DASH_30YD: { min: 3.0, max: 8.0, label: '30yd dash' },
  DASH_40YD: { min: 4.0, max: 10.0, label: '40yd dash' },
  DASH_10M: { min: 1.0, max: 4.0, label: '10m dash' },
  DASH_20M: { min: 2.0, max: 6.0, label: '20m dash' },
  DASH_30M: { min: 3.0, max: 8.0, label: '30m dash' },
  DASH_40M: { min: 4.0, max: 10.0, label: '40m dash' },
  FLY10_TIME: { min: 0.8, max: 3.0, label: '10yd fly' },
  FLY10M_TIME: { min: 0.8, max: 3.0, label: '10m fly' },
  AGILITY_505: { min: 1.5, max: 5.0, label: '505 agility' },
  AGILITY_505_L: { min: 1.5, max: 5.0, label: '505 agility (L)' },
  AGILITY_505_R: { min: 1.5, max: 5.0, label: '505 agility (R)' },
  AGILITY_5105: { min: 3.5, max: 8.0, label: '5-10-5 agility' },
  AGILITY_5105_L: { min: 3.5, max: 8.0, label: '5-10-5 agility (L)' },
  AGILITY_5105_R: { min: 3.5, max: 8.0, label: '5-10-5 agility (R)' },
  RSI: { min: 0.1, max: 4.0, label: 'RSI' },
};

/**
 * Returns the unit suffix to use for dash/fly metric codes based on the row's Units column.
 * DashR exports "Imperial" or "Metric" in this field.
 */
function getDistanceUnit(row: DashrRow): 'YD' | 'M' {
  const units = (row['Units'] || '').trim().toLowerCase();
  return units === 'metric' ? 'M' : 'YD';
}

interface DashrRow {
  [key: string]: string;
}

/**
 * Parse a CSV line with RFC 4180 quote-aware splitting.
 * Handles quoted fields that may contain commas or escaped quotes.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Detect if a buffer contains Windows-1252 specific bytes (0x80-0x9F range).
 * These byte values are valid in Windows-1252 but invalid in UTF-8 and ISO-8859-1,
 * making them a reliable signal for Windows-1252 encoding.
 */
function isLikelyWindows1252(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte >= 0x80 && byte <= 0x9F) {
      return true;
    }
  }
  return false;
}

/**
 * Decode buffer to string, handling BOM stripping and Windows-1252 encoding.
 */
function normalizeBuffer(buffer: Buffer): string {
  let text: string;

  if (isLikelyWindows1252(buffer)) {
    text = iconv.decode(buffer, 'win1252');
  } else {
    text = buffer.toString('utf-8');
  }

  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  // Normalize line endings
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Parse CSV text into array of row objects keyed by header names
 */
function parseRawCsv(text: string): DashrRow[] {
  const lines = text.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: DashrRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: DashrRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Extract date portion from Dashr timestamp: "MM/DD/YYYY HH:mm:ss" → "YYYY-MM-DD"
 */
function extractDateFromTimestamp(timestamp: string): string | null {
  const match = timestamp.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, month, day, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * Parse numeric value from Dashr speed format: "9.21 (MPH)" → 9.21
 */
export function parseSpeedValue(str: string): number | null {
  if (!str || !str.trim()) return null;
  const match = str.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Parse a float, returning null for empty/zero/invalid values
 */
function parseFloat_(str: string): number | null {
  if (!str || !str.trim()) return null;
  const val = parseFloat(str);
  return isNaN(val) ? null : val;
}

/**
 * Determine the metric code from a Dashr row based on Type + distances
 */
function mapDrillType(row: DashrRow): string | null {
  const type = (row['Type'] || '').trim();
  const finalDist = parseFloat_(row['Final Distance']);
  const direction = (row['Direction'] || '').trim().toUpperCase();
  const unit = getDistanceUnit(row);

  switch (type) {
    case 'Dash': {
      // Map based on final distance — only known metric codes.
      // Unit suffix (YD vs M) is controlled by the row's Units column.
      if (finalDist === 10) return unit === 'M' ? MetricType.DASH_10M : MetricType.DASH_10YD;
      if (finalDist === 20) return unit === 'M' ? MetricType.DASH_20M : MetricType.DASH_20YD;
      if (finalDist === 30) return unit === 'M' ? MetricType.DASH_30M : MetricType.DASH_30YD;
      if (finalDist === 40) return unit === 'M' ? MetricType.DASH_40M : MetricType.DASH_40YD;
      // Unknown dash distance — return null so it's skipped with a warning,
      // rather than creating a non-standard metric code in the database.
      return null;
    }

    case 'Flying': {
      // Flying sprints: map to FLY10_TIME / FLY10M_TIME when Final Distance = 10
      if (finalDist === 10) return unit === 'M' ? MetricType.FLY10M_TIME : MetricType.FLY10_TIME;
      // Other flying distances aren't standard metrics
      return null;
    }

    case '505 Agility Test': {
      if (direction === 'L' || direction === 'LEFT') return MetricType.AGILITY_505_L;
      if (direction === 'R' || direction === 'RIGHT') return MetricType.AGILITY_505_R;
      return MetricType.AGILITY_505;
    }

    case 'Pro Agility':
    case '5-10-5': {
      if (direction === 'L' || direction === 'LEFT') return MetricType.AGILITY_5105_L;
      if (direction === 'R' || direction === 'RIGHT') return MetricType.AGILITY_5105_R;
      return MetricType.AGILITY_5105;
    }

    default:
      return null;
  }
}

/**
 * Extract split times from a Dashr row's columnar split pattern.
 * Dashr uses: Split Time 1 / Split Distance 1 (first gate)
 *             Start Time 2 / Split Distance 2 (second gate, cumulative)
 *             Start Time 3 / Split Distance 3 (third gate, cumulative)
 *             ... up to Start Time 6 / Split Distance 6
 */
function extractSplits(row: DashrRow): ParsedSplit[] {
  const splits: ParsedSplit[] = [];
  const unit = getDistanceUnit(row);

  // NOTE: metric codes are built by template literal below (`DASH_${dist}${unit}`).
  // Non-standard distances (e.g. a 15m split from an unusual DashR export) will
  // silently produce metric codes that don't exist in site_metrics — they pass
  // through to the measurements table (which has no FK on `metric`) but are
  // orphaned from org-level enablement. This is pre-existing behaviour for the
  // yards path and is retained for meters; if future exports ship unusual
  // distances, validate against a known-code allowlist here.

  // Split 1: uses "Split Time 1" / "Split Distance 1"
  const split1Time = parseFloat_(row['Split Time 1']);
  const split1Dist = parseFloat_(row['Split Distance 1']);
  if (split1Time && split1Time > 0 && split1Dist && split1Dist > 0) {
    const metric = `DASH_${split1Dist}${unit}`;
    splits.push({ metric, value: split1Time, units: 's' });
  }

  // Splits 2-6: use "Start Time N" / "Split Distance N" (cumulative times)
  for (let i = 2; i <= 6; i++) {
    const time = parseFloat_(row[`Start Time ${i}`]);
    const dist = parseFloat_(row[`Split Distance ${i}`]);
    if (time && time > 0 && dist && dist > 0) {
      const metric = `DASH_${dist}${unit}`;
      splits.push({ metric, value: time, units: 's' });
    }
  }

  return splits;
}

/**
 * Validate a single row for data quality
 */
function validateRow(row: DashrRow): string | null {
  const finalTime = parseFloat_(row['Final Time']);
  const finalDist = parseFloat_(row['Final Distance']);
  const type = (row['Type'] || '').trim();

  if (!type) return 'Missing drill type';
  if (finalTime === null || finalTime <= 0) return 'Invalid or missing final time';

  // For most drill types, final distance should be positive
  if (type !== '505 Agility Test' && (finalDist === null || finalDist <= 0)) {
    return 'Invalid or missing final distance';
  }

  return null; // valid
}

/**
 * Check if a measurement value is an outlier
 */
function checkOutlier(metric: string, value: number): string | null {
  const range = OUTLIER_RANGES[metric];
  if (!range) return null;
  if (value < range.min) return `${range.label} time ${value}s is unusually fast (< ${range.min}s)`;
  if (value > range.max) return `${range.label} time ${value}s is unusually slow (> ${range.max}s)`;
  return null;
}

/**
 * Derive FLY10_TIME / FLY10M_TIME from an athlete's dash drill splits.
 *
 * FLY10 = time at 30(yd|m) − time at 20(yd|m) — the "flying 10" segment
 * after initial acceleration. A separate derivation runs per unit system;
 * yards dashes produce FLY10_TIME, meters dashes produce FLY10M_TIME.
 * When multiple candidates exist in the same unit, picks the fastest.
 */
function deriveFly10ForAthlete(
  drills: ParsedDrillResult[],
  unit: 'YD' | 'M',
): ParsedDrillResult | null {
  const flyMetric = unit === 'M' ? MetricType.FLY10M_TIME : MetricType.FLY10_TIME;
  const dash20 = unit === 'M' ? 'DASH_20M' : 'DASH_20YD';
  const dash30 = unit === 'M' ? 'DASH_30M' : 'DASH_30YD';
  const dash40 = unit === 'M' ? 'DASH_40M' : 'DASH_40YD';

  // Skip if athlete already has a direct measurement in this unit system
  if (drills.some(d => d.metric === flyMetric)) return null;

  const candidates: { value: number; source: string }[] = [];

  for (const drill of drills) {
    if (!drill.splits || drill.splits.length === 0) continue;

    let time20: number | undefined;
    let time30: number | undefined;
    let source: string | undefined;

    if (drill.metric === dash30) {
      // 30(yd|m) dash: FLY10 = finalTime − split at 20(yd|m)
      const split20 = drill.splits.find(s => s.metric === dash20);
      if (split20) {
        time20 = split20.value;
        time30 = drill.value;
        source = dash30;
      }
    } else if (drill.metric === dash40) {
      // 40(yd|m) dash: FLY10 = split at 30(yd|m) − split at 20(yd|m)
      const split20 = drill.splits.find(s => s.metric === dash20);
      const split30 = drill.splits.find(s => s.metric === dash30);
      if (split20 && split30) {
        time20 = split20.value;
        time30 = split30.value;
        source = dash40;
      }
    }

    if (time20 !== undefined && time30 !== undefined && source) {
      const fly10 = parseFloat((time30 - time20).toFixed(3));
      if (fly10 > 0) {
        candidates.push({ value: fly10, source });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Pick fastest (lowest) FLY10
  const best = candidates.reduce((a, b) => (a.value <= b.value ? a : b));
  const outlierReason = checkOutlier(flyMetric, best.value);

  return {
    metric: flyMetric,
    value: best.value,
    units: 's',
    derivedFrom: `${best.source} splits`,
    ...(outlierReason ? { isOutlier: true, outlierReason } : {}),
  };
}

/**
 * Group rows by athlete name + drill type + date + direction,
 * then select the best (fastest) attempt per group.
 */
function selectBestAttempts(rows: DashrRow[]): DashrRow[] {
  const groups = new Map<string, DashrRow[]>();

  for (const row of rows) {
    const date = extractDateFromTimestamp(row['Date'] || '');
    const key = [
      (row['First Name'] || '').toLowerCase().trim(),
      (row['Last Name'] || '').toLowerCase().trim(),
      (row['Type'] || '').toLowerCase().trim(),
      date || '',
      (row['Direction'] || '').toLowerCase().trim(),
      row['Final Distance'] || '',
    ].join('|');

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const best: DashrRow[] = [];
  for (const [, groupRows] of groups) {
    // Select row with fastest Final Time
    let bestRow = groupRows[0];
    let bestTime = parseFloat_(bestRow['Final Time']) ?? Infinity;

    for (let i = 1; i < groupRows.length; i++) {
      const time = parseFloat_(groupRows[i]['Final Time']) ?? Infinity;
      if (time < bestTime) {
        bestTime = time;
        bestRow = groupRows[i];
      }
    }
    best.push(bestRow);
  }

  return best;
}

export class DashrCsvParser implements DeviceImportParser {
  detectFormat(buffer: Buffer): boolean {
    const text = normalizeBuffer(buffer);
    const firstLine = text.split('\n')[0] || '';
    const headers = parseCsvLine(firstLine);

    return REQUIRED_COLUMNS.every(col =>
      headers.some(h => h === col)
    );
  }

  getSessionDates(buffer: Buffer): ParsedSessionData[] {
    const text = normalizeBuffer(buffer);
    const rows = parseRawCsv(text);

    // Group by date
    const dateGroups = new Map<string, { athletes: Set<string>; drillCount: number }>();

    for (const row of rows) {
      const date = extractDateFromTimestamp(row['Date'] || '');
      if (!date) continue;
      if (validateRow(row) !== null) continue;

      if (!dateGroups.has(date)) {
        dateGroups.set(date, { athletes: new Set(), drillCount: 0 });
      }
      const group = dateGroups.get(date)!;
      group.athletes.add(`${row['First Name']}|${row['Last Name']}`);
      group.drillCount++;
    }

    return Array.from(dateGroups.entries())
      .map(([date, group]) => ({
        sessionDate: date,
        sessionLabel: formatDateLabel(date),
        athleteCount: group.athletes.size,
        drillCount: group.drillCount,
      }))
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)); // newest first
  }

  parse(buffer: Buffer, sessionDate?: string): ParsedImportData {
    const text = normalizeBuffer(buffer);
    const allRows = parseRawCsv(text);
    const warnings: string[] = [];

    // Filter to selected session date if provided
    let rows = allRows;
    if (sessionDate) {
      rows = allRows.filter(row => {
        const date = extractDateFromTimestamp(row['Date'] || '');
        return date === sessionDate;
      });
    }

    // Validate rows and collect warnings
    const validRows: DashrRow[] = [];
    for (const row of rows) {
      const error = validateRow(row);
      if (error) {
        const name = `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim();
        warnings.push(`Skipped row for ${name || 'unknown'}: ${error}`);
        continue;
      }
      validRows.push(row);
    }

    // Select best attempts per athlete/drill/date/direction
    const bestRows = selectBestAttempts(validRows);

    // Group by athlete
    const athleteMap = new Map<string, ParsedAthleteResult>();

    for (const row of bestRows) {
      const firstName = (row['First Name'] || '').trim();
      const lastName = (row['Last Name'] || '').trim();
      const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;

      if (!athleteMap.has(key)) {
        athleteMap.set(key, {
          firstName,
          lastName,
          middleName: (row['Middle Name'] || '').trim() || undefined,
          drills: [],
        });
      }

      const metric = mapDrillType(row);
      if (!metric) {
        warnings.push(`Unsupported drill type "${row['Type']}" for ${firstName} ${lastName}`);
        continue;
      }

      const finalTime = parseFloat_(row['Final Time'])!;
      const splits = extractSplits(row);
      const outlierReason = checkOutlier(metric, finalTime);

      // Map splits to known metric codes
      const mappedSplits = splits
        .filter(s => {
          // Only keep splits that map to known metrics
          const knownMetrics = Object.values(MetricType);
          return (knownMetrics as string[]).includes(s.metric);
        })
        .map(s => {
          const splitOutlier = checkOutlier(s.metric, s.value);
          return { ...s, ...(splitOutlier ? { isOutlier: true, outlierReason: splitOutlier } : {}) };
        });

      const drill: ParsedDrillResult = {
        metric,
        value: finalTime,
        units: 's',
        ...(mappedSplits.length > 0 ? { splits: mappedSplits } : {}),
        ...(outlierReason ? { isOutlier: true, outlierReason } : {}),
      };

      athleteMap.get(key)!.drills.push(drill);
    }

    // Derive FLY10_TIME / FLY10M_TIME from dash splits when no direct
    // measurement exists. Each unit system is evaluated independently:
    // an athlete with both yards dashes and a metric dash gets both derived.
    for (const [, athlete] of athleteMap) {
      const fly10Yd = deriveFly10ForAthlete(athlete.drills, 'YD');
      if (fly10Yd) athlete.drills.push(fly10Yd);
      const fly10M = deriveFly10ForAthlete(athlete.drills, 'M');
      if (fly10M) athlete.drills.push(fly10M);
    }

    const athletes = Array.from(athleteMap.values());

    // Compute sessions from allRows (already parsed) instead of re-parsing buffer
    const sessionDateGroups = new Map<string, { athletes: Set<string>; drillCount: number }>();
    for (const row of allRows) {
      const date = extractDateFromTimestamp(row['Date'] || '');
      if (!date) continue;
      if (validateRow(row) !== null) continue;
      if (!sessionDateGroups.has(date)) {
        sessionDateGroups.set(date, { athletes: new Set(), drillCount: 0 });
      }
      const group = sessionDateGroups.get(date)!;
      group.athletes.add(`${row['First Name']}|${row['Last Name']}`);
      group.drillCount++;
    }
    const sessions = Array.from(sessionDateGroups.entries())
      .map(([date, group]) => ({
        sessionDate: date,
        sessionLabel: formatDateLabel(date),
        athleteCount: group.athletes.size,
        drillCount: group.drillCount,
      }))
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));

    // Handle RSI column if present
    for (const row of bestRows) {
      const rsi = parseFloat_(row['RSI']);
      if (rsi && rsi > 0) {
        const firstName = (row['First Name'] || '').trim();
        const lastName = (row['Last Name'] || '').trim();
        const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
        const athlete = athleteMap.get(key);
        if (athlete) {
          // Only add if not already present
          const hasRsi = athlete.drills.some(d => d.metric === MetricType.RSI);
          if (!hasRsi) {
            const outlierReason = checkOutlier(MetricType.RSI, rsi);
            athlete.drills.push({
              metric: MetricType.RSI,
              value: rsi,
              units: '',
              ...(outlierReason ? { isOutlier: true, outlierReason } : {}),
            });
          }
        }
      }
    }

    return {
      source: 'dashr_csv',
      sessions,
      athletes,
      warnings,
    };
  }
}

/**
 * Format "YYYY-MM-DD" → "Dec 27, 2025"
 */
function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${day}, ${year}`;
}
