/**
 * Device Import Parser Types
 *
 * Generic interfaces for pluggable device data parsers (Dashr, OVR, etc.)
 */

export interface ParsedDrillResult {
  metric: string;       // e.g. 'DASH_30YD', 'FLY10_TIME', 'AGILITY_505'
  value: number;        // Final time or score
  units: string;        // 's', 'in', 'mph', etc.
  splits?: ParsedSplit[];
  isOutlier?: boolean;
  outlierReason?: string;
  derivedFrom?: string;
}

export interface ParsedSplit {
  metric: string;       // e.g. 'DASH_10YD', 'DASH_20YD'
  value: number;
  units: string;
}

export interface ParsedAthleteResult {
  firstName: string;
  lastName: string;
  middleName?: string;
  drills: ParsedDrillResult[];
}

export interface ParsedSessionData {
  sessionDate: string;    // ISO date string 'YYYY-MM-DD'
  sessionLabel: string;   // Human-readable date label
  athleteCount: number;
  drillCount: number;
}

export interface ParsedImportData {
  source: string;         // 'dashr_csv', 'ovr_csv', etc.
  sessions: ParsedSessionData[];
  athletes: ParsedAthleteResult[];
  warnings: string[];
}

export interface DeviceImportParser {
  /** Check if the buffer looks like this parser's format */
  detectFormat(buffer: Buffer): boolean;
  /** Parse the full CSV buffer into structured data */
  parse(buffer: Buffer, sessionDate?: string): ParsedImportData;
  /** Get available session dates from a multi-session CSV */
  getSessionDates(buffer: Buffer): ParsedSessionData[];
}
