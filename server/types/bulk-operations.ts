// Types for bulk operations to replace any[] types

export interface ValidationViolation {
  field: string;
  value: any;
  message: string;
  rowIndex?: number;
}

export interface ValidationFix {
  field: string;
  originalValue: any;
  fixedValue: any;
  description: string;
  rowIndex?: number;
}

export interface ProcessedImportRow {
  originalData: Record<string, any>;
  validatedData: Record<string, any>;
  rowIndex: number;
  status: 'valid' | 'invalid' | 'warning';
  errors: string[];
  warnings: string[];
}

export interface BulkOperationResult {
  success: number;
  errorCount: number;
  results: OperationResult[];
  errors?: OperationError[];
}

export interface OperationResult {
  id: string;
  status: 'success' | 'error';
  message?: string;
  data?: any;
}

export interface OperationError {
  id?: string;
  error: string;
  details?: string;
  rowIndex?: number;
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  processedData: ProcessedImportRow[];
  violations: ValidationViolation[];
  fixes: ValidationFix[];
}

export interface CsvRow {
  [key: string]: string | number | boolean | null;
}

export interface ExportRow {
  // Define specific fields for athlete export
  firstName: string;
  lastName: string;
  email: string;
  birthDate?: string;
  graduationYear?: number;
  school?: string;
  sports?: string;
  positions?: string;
  height?: number;
  weight?: number;
  gender?: string;
  teams?: string;
}