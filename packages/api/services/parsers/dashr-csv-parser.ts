/**
 * Dashr CSV Parser
 *
 * Parses Dashr timing gate CSV exports into structured import data.
 * Handles multi-session CSVs, split extraction, drill type mapping,
 * best-attempt selection, and outlier detection.
 */

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
  DASH_10YD: { min: 1.0, max: 4.0, label: '10yd dash' },
  DASH_20YD: { min: 2.0, max: 6.0, label: '20yd dash' },
  DASH_30YD: { min: 3.0, max: 8.0, label: '30yd dash' },
  DASH_40YD: { min: 4.0, max: 10.0, label: '40yd dash' },
  FLY10_TIME: { min: 0.8, max: 3.0, label: '10yd fly' },
  AGILITY_505: { min: 1.5, max: 5.0, label: '505 agility' },
  AGILITY_505_L: { min: 1.5, max: 5.0, label: '505 agility (L)' },
  AGILITY_505_R: { min: 1.5, max: 5.0, label: '505 agility (R)' },
  AGILITY_5105: { min: 3.5, max: 8.0, label: '5-10-5 agility' },
  AGILITY_5105_L: { min: 3.5, max: 8.0, label: '5-10-5 agility (L)' },
  AGILITY_5105_R: { min: 3.5, max: 8.0, label: '5-10-5 agility (R)' },
  RSI: { min: 0.1, max: 4.0, label: 'RSI' },
};

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
 * Strip BOM and normalize line endings
 */
function normalizeBuffer(buffer: Buffer): string {
  let text = buffer.toString('utf-8');
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

  switch (type) {
    case 'Dash': {
      // Map based on final distance
      if (finalDist === 10) return MetricType.DASH_10YD;
      if (finalDist === 20) return MetricType.DASH_20YD;
      if (finalDist === 30) return MetricType.DASH_30YD;
      if (finalDist === 40) return MetricType.DASH_40YD;
      // Unknown dash distance — skip
      if (finalDist && finalDist > 0) return `DASH_${finalDist}YD`;
      return null;
    }

    case 'Flying': {
      // Flying sprints: map to FLY10_TIME when Final Distance = 10
      if (finalDist === 10) return MetricType.FLY10_TIME;
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

  // Split 1: uses "Split Time 1" / "Split Distance 1"
  const split1Time = parseFloat_(row['Split Time 1']);
  const split1Dist = parseFloat_(row['Split Distance 1']);
  if (split1Time && split1Time > 0 && split1Dist && split1Dist > 0) {
    const metric = `DASH_${split1Dist}YD`;
    splits.push({ metric, value: split1Time, units: 's' });
  }

  // Splits 2-6: use "Start Time N" / "Split Distance N" (cumulative times)
  for (let i = 2; i <= 6; i++) {
    const time = parseFloat_(row[`Start Time ${i}`]);
    const dist = parseFloat_(row[`Split Distance ${i}`]);
    if (time && time > 0 && dist && dist > 0) {
      const metric = `DASH_${dist}YD`;
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

    const athletes = Array.from(athleteMap.values());
    const sessions = this.getSessionDates(buffer);

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
