import Papa from 'papaparse';

// Constants for batch processing
export const MAX_ROWS_PER_BATCH = 10000;
export const MAX_SAFE_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Type definitions for batch processing
export interface BatchResult {
  totalRows: number;
  errors: ImportError[];
  warnings: ImportWarning[];
  summary: {
    created: number;
    updated: number;
    matched: number;
    skipped: number;
  };
  results?: any[];
  createdTeams?: any[];
  createdAthletes?: any[];
  failed?: boolean;
  batchNumber?: number;
}

export interface ImportError {
  row?: number;
  field?: string;
  message: string;
  batch?: number;
}

export interface ImportWarning {
  row?: number;
  message: string;
  batch?: number;
}

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Clean up blob URL to prevent memory leak
    URL.revokeObjectURL(url);
  }
}

/**
 * Sanitize a CSV cell value to prevent formula injection attacks
 * This function handles both input and output sanitization.
 *
 * @param value - The cell value to sanitize
 * @returns Sanitized value safe for CSV processing
 */
export function sanitizeCSVCell(value: any): string {
  if (value === null || value === undefined) return '';

  const strValue = String(value);

  // Prevent CSV formula injection by prefixing dangerous characters with a single quote
  // Dangerous characters: =, +, -, @, tab, carriage return
  // Exception: Allow negative numbers (e.g., -10, -3.14)
  if (/^[=+\-@\t\r]/.test(strValue)) {
    // Allow negative numbers: starts with - and is followed by digits
    if (/^-\d+\.?\d*$/.test(strValue)) {
      return strValue;
    }
    return `'${strValue}`;
  }

  return strValue;
}

/**
 * Parse CSV text into array of objects using PapaParse
 *
 * Uses PapaParse for robust CSV parsing that correctly handles:
 * - Commas within quoted fields
 * - Escaped quotes within quoted fields
 * - Multi-line values within quoted fields
 * - Various CSV dialects and edge cases
 *
 * All values are sanitized to prevent formula injection attacks.
 *
 * @param csvText - Raw CSV text to parse
 * @returns Array of objects with header keys
 */
export function parseCSV(csvText: string): any[] {
  if (!csvText || !csvText.trim()) return [];

  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transform: sanitizeCSVCell,
    transformHeader: (header: string) => header.trim()
  });

  if (result.errors && result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }

  return result.data as any[];
}


export function arrayToCSV(data: any[], headers?: string[]): string {
  if (data.length === 0) return '';

  const csvHeaders = headers || Object.keys(data[0]);
  const headerRow = csvHeaders.join(',');

  const rows = data.map(row =>
    csvHeaders.map(header => {
      const rawValue = row[header] || '';
      const sanitizedValue = sanitizeCSVCell(rawValue);

      // Escape commas and quotes
      if (typeof sanitizedValue === 'string' && (sanitizedValue.includes(',') || sanitizedValue.includes('"'))) {
        return `"${sanitizedValue.replace(/"/g, '""')}"`;
      }
      return sanitizedValue;
    }).join(',')
  );

  return [headerRow, ...rows].join('\n');
}

// Email validation function
function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value.trim());
}

// Phone number validation function
function isValidPhoneNumber(value: string): boolean {
  // Remove all non-digit characters for validation
  const cleaned = value.replace(/\D/g, '');
  // Support various formats:
  // - US/Canada: 10 digits or 1 + 10 digits
  // - International: 7-15 digits, optionally starting with +
  // - Extensions are not supported in this simplified version
  return /^(\+?1?\d{10}|\+?\d{7,15})$/.test(cleaned) && cleaned.length >= 7 && cleaned.length <= 15;
}

// Smart data placement function - detects emails and phone numbers regardless of column
function smartPlaceContactData(row: any): { emails: string[], phoneNumbers: string[], warnings: string[] } {
  const emails: string[] = [];
  const phoneNumbers: string[] = [];
  const warnings: string[] = [];
  
  // Check all possible contact fields for smart detection
  const contactFields = ['emails', 'phoneNumbers', 'email', 'phone', 'contact', 'contactInfo'];
  
  contactFields.forEach(field => {
    if (row[field] && row[field].trim()) {
      const values = row[field].split(/[,;]/).map((v: string) => v.trim()).filter(Boolean);
      
      values.forEach((value: string) => {
        if (isValidEmail(value)) {
          if (!emails.includes(value)) {
            emails.push(value);
            if (field === 'phoneNumbers' || field === 'phone') {
              warnings.push(`Found email "${value}" in phone number field, moved to emails`);
            }
          }
        } else if (isValidPhoneNumber(value)) {
          if (!phoneNumbers.includes(value)) {
            phoneNumbers.push(value);
            if (field === 'emails' || field === 'email') {
              warnings.push(`Found phone number "${value}" in email field, moved to phone numbers`);
            }
          }
        } else if (value.length > 0) {
          // If it's not empty but doesn't match either format, warn about it
          warnings.push(`Unrecognized contact format: "${value}" in ${field} field`);
        }
      });
    }
  });
  
  return { emails, phoneNumbers, warnings };
}

export function validateAthleteCSV(row: any): { valid: boolean; errors: string[]; warnings?: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!row.firstName || !row.firstName.trim()) {
    errors.push('First name is required');
  }
  
  if (!row.lastName || !row.lastName.trim()) {
    errors.push('Last name is required');
  }
  
  // Validate birth date format - now required
  if (!row.birthDate || !row.birthDate.trim()) {
    errors.push('Birth date is required');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(row.birthDate)) {
      errors.push('Birth date must be in YYYY-MM-DD format');
    } else {
      // Validate date is not in the future
      const birthDate = new Date(row.birthDate);
      if (birthDate > new Date()) {
        errors.push('Birth date cannot be in the future');
      }
    }
  }
  
  // Birth year is now optional but validate if provided
  if (row.birthYear && row.birthYear.trim()) {
    if (isNaN(parseInt(row.birthYear))) {
      errors.push('Birth year must be a valid number');
    } else {
      const year = parseInt(row.birthYear);
      if (year < 1990 || year > 2020) {
        errors.push('Birth year must be between 1990 and 2020');
      }
    }
  }
  
  // Smart contact data validation and placement
  const contactData = smartPlaceContactData(row);
  warnings.push(...contactData.warnings);
  
  // Update row data with properly placed contact information
  row.emails = contactData.emails.join(',');
  row.phoneNumbers = contactData.phoneNumbers.join(',');
  
  // Validate final email formats
  if (contactData.emails.length > 0) {
    const invalidEmails = contactData.emails.filter((email: string) => !isValidEmail(email));
    if (invalidEmails.length > 0) {
      errors.push(`Invalid email format: ${invalidEmails.join(', ')}`);
    }
  }
  
  // Validate final phone number formats
  if (contactData.phoneNumbers.length > 0) {
    const invalidPhones = contactData.phoneNumbers.filter((phone: string) => !isValidPhoneNumber(phone));
    if (invalidPhones.length > 0) {
      errors.push(`Invalid phone number format: ${invalidPhones.join(', ')}`);
    }
  }
  
  // Validate height and weight if provided
  if (row.height && (isNaN(parseInt(row.height)) || parseInt(row.height) < 36 || parseInt(row.height) > 84)) {
    errors.push('Height must be between 36-84 inches');
  }
  
  if (row.weight && (isNaN(parseInt(row.weight)) || parseInt(row.weight) < 50 || parseInt(row.weight) > 400)) {
    errors.push('Weight must be between 50-400 pounds');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// Export the validation functions for use elsewhere
export { isValidEmail, isValidPhoneNumber, smartPlaceContactData };

export function validateMeasurementCSV(row: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate athlete identification
  if (!row.firstName || !row.firstName.trim()) {
    errors.push('First name is required');
  }
  
  if (!row.lastName || !row.lastName.trim()) {
    errors.push('Last name is required');
  }
  
  if (!row.birthYear || isNaN(parseInt(row.birthYear))) {
    errors.push('Valid birth year is required');
  } else {
    const year = parseInt(row.birthYear);
    if (year < 1990 || year > 2020) {
      errors.push('Birth year must be between 1990 and 2020');
    }
  }
  
  // Validate measurement date
  if (!row.date || !row.date.trim()) {
    errors.push('Date is required');
  } else {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(row.date)) {
      errors.push('Date must be in YYYY-MM-DD format');
    }
  }
  
  // Validate age
  if (!row.age || isNaN(parseInt(row.age))) {
    errors.push('Valid age is required');
  } else {
    const age = parseInt(row.age);
    if (age < 10 || age > 25) {
      errors.push('Age must be between 10 and 25');
    }
  }
  
  // Validate metric type
  const validMetrics = ['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'RSI', 'TOP_SPEED'];
  if (!row.metric || !validMetrics.includes(row.metric)) {
    errors.push(`Metric must be one of: ${validMetrics.join(', ')}`);
  }
  
  // Validate value
  if (!row.value || isNaN(parseFloat(row.value))) {
    errors.push('Valid numeric value is required');
  } else {
    const value = parseFloat(row.value);
    if (value <= 0) {
      errors.push('Value must be positive');
    }
  }
  
  // Validate units
  const validUnits = ['s', 'in', 'mph', ''];
  if (row.units && !validUnits.includes(row.units)) {
    errors.push('Units must be "s" for time, "in" for distance, "mph" for speed, or empty for dimensionless');
  }
  
  // Validate flyInDistance if provided
  if (row.flyInDistance && row.flyInDistance.trim() && isNaN(parseFloat(row.flyInDistance))) {
    errors.push('Fly-in distance must be a valid number');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Split an array of data into chunks of specified size
 * @param data - Array of data objects to split
 * @param chunkSize - Maximum size of each chunk
 * @returns Array of chunks, where each chunk is an array of data objects
 */
export function chunkCSVData(data: any[], chunkSize: number): any[][] {
  if (data.length === 0) return [];

  const chunks: any[][] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize));
  }

  return chunks;
}

/**
 * Create a CSV string from a chunk of data with specified headers
 * @param chunk - Array of data objects
 * @param headers - Array of header names (determines column order)
 * @returns CSV string with headers and data rows
 */
export function createCSVFromChunk(chunk: any[], headers: string[]): string {
  // Helper function to escape and format a single cell value
  const formatCell = (value: any): string => {
    // Handle null/undefined
    if (value === null || value === undefined) return '';

    const strValue = String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
      return `"${strValue.replace(/"/g, '""')}"`;
    }

    return strValue;
  };

  // Create header row
  const headerRow = headers.join(',');

  // Create data rows
  const dataRows = chunk.map(row => {
    return headers.map(header => formatCell(row[header])).join(',');
  });

  // Combine header and data rows
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Helper function to determine if a file needs batch processing
 */
export function needsBatchProcessing(rowCount: number, maxRowsPerBatch: number = MAX_ROWS_PER_BATCH): boolean {
  return rowCount > maxRowsPerBatch;
}

/**
 * Helper function to calculate batch information
 */
export function getBatchInfo(rowCount: number, maxRowsPerBatch: number = MAX_ROWS_PER_BATCH) {
  if (rowCount <= maxRowsPerBatch) {
    return {
      needsBatching: false,
      batchCount: 1,
      rowsPerBatch: rowCount,
      lastBatchSize: rowCount
    };
  }

  const batchCount = Math.ceil(rowCount / maxRowsPerBatch);
  const lastBatchSize = rowCount % maxRowsPerBatch || maxRowsPerBatch;

  return {
    needsBatching: true,
    batchCount,
    rowsPerBatch: maxRowsPerBatch,
    lastBatchSize
  };
}

/**
 * Aggregate results from multiple batch imports
 */
export function aggregateBatchResults(batchResults: BatchResult[]): BatchResult {
  const aggregated: BatchResult = {
    totalRows: 0,
    errors: [] as ImportError[],
    warnings: [] as ImportWarning[],
    summary: {
      created: 0,
      updated: 0,
      matched: 0,
      skipped: 0
    },
    results: [] as any[],
    createdTeams: [] as any[],
    createdAthletes: [] as any[]
  };

  batchResults.forEach((result, batchIndex) => {
    aggregated.totalRows += result.totalRows || 0;

    // Aggregate errors with batch context
    if (result.errors && result.errors.length > 0) {
      result.errors.forEach((error: any) => {
        aggregated.errors.push({
          ...error,
          batch: batchIndex + 1,
          message: `[Batch ${batchIndex + 1}] ${error.message || error}`
        });
      });
    }

    // Aggregate warnings
    if (result.warnings && result.warnings.length > 0) {
      aggregated.warnings.push(...result.warnings);
    }

    // Aggregate summary counts
    if (result.summary) {
      aggregated.summary.created += result.summary.created || 0;
      aggregated.summary.updated += result.summary.updated || 0;
      aggregated.summary.matched += result.summary.matched || 0;
      aggregated.summary.skipped += result.summary.skipped || 0;
    }

    // Aggregate results
    if (result.results && aggregated.results) {
      aggregated.results.push(...result.results);
    }

    // Aggregate created teams
    if (result.createdTeams && aggregated.createdTeams) {
      aggregated.createdTeams.push(...result.createdTeams);
    }

    // Aggregate created athletes
    if (result.createdAthletes && aggregated.createdAthletes) {
      aggregated.createdAthletes.push(...result.createdAthletes);
    }
  });

  return aggregated;
}
