import { sanitizeCSVCell } from '@/lib/csv';

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

function buildRow(athlete: DashrExportAthlete): string[] {
  const cells = new Array<string>(DASHR_COLUMNS.length).fill('');
  cells[0] = sanitizeCSVCell(athlete.firstName ?? '');
  cells[2] = sanitizeCSVCell(athlete.lastName ?? '');
  return cells;
}

export async function buildDashrXlsxBuffer(
  athletes: DashrExportAthlete[],
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Athletes');

  worksheet.addRow([...DASHR_COLUMNS]);
  worksheet.getRow(1).font = { bold: true };

  for (const athlete of athletes) {
    worksheet.addRow(buildRow(athlete));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function sanitizeDashrFilename(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const stem = cleaned || 'athletes';
  return `dashr-${stem}.xlsx`;
}

export async function downloadDashrXlsx(
  filename: string,
  athletes: DashrExportAthlete[],
): Promise<void> {
  const buffer = await buildDashrXlsxBuffer(athletes);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
