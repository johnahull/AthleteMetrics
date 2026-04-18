import { sanitizeCSVCell, downloadCSV } from '@/lib/csv';

export const DASHR_COLUMNS = [
  'First Name (Required)',
  'Middle Name',
  'Last Name (Required)',
  'Shoe Size',
  'Height',
  'Weight',
  'Wingspan',
  'Reach',
  'Hand Size',
  'Email',
  'Date Measured',
  'Sport',
  'Position',
  'Graduation Year',
  'Birthday',
  'Sex',
  'Badge ID',
  'Third Party ID',
  'Custom Field 1',
  'Custom Field 2',
  'Custom Field 3',
  'Custom Field 4',
] as const;

export interface DashrExportAthlete {
  firstName: string;
  lastName: string;
}

function escapeCell(value: string): string {
  const sanitized = sanitizeCSVCell(value);
  if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function buildDashrCsv(athletes: DashrExportAthlete[]): string {
  const headerRow = DASHR_COLUMNS.join(',');
  if (athletes.length === 0) return headerRow;

  const rows = athletes.map(athlete => {
    const cells = new Array<string>(DASHR_COLUMNS.length).fill('');
    cells[0] = escapeCell(athlete.firstName ?? '');
    cells[2] = escapeCell(athlete.lastName ?? '');
    return cells.join(',');
  });

  return [headerRow, ...rows].join('\n');
}

export function sanitizeDashrFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const stem = cleaned || 'athletes';
  return `dashr-${stem}.csv`;
}

export function downloadDashrCsv(filename: string, athletes: DashrExportAthlete[]): void {
  const csv = buildDashrCsv(athletes);
  downloadCSV(csv, filename);
}
