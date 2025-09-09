import { z } from "zod";

export interface OCRProcessingResult {
  success: boolean;
  message: string;
  results: {
    totalExtracted: number;
    successful: number;
    failed: number;
    ocrConfidence: number;
    extractedText: string;
    processedData: ProcessedMeasurement[];
    errors: ImportError[];
    warnings: string[];
  };
}

export interface ProcessedMeasurement {
  measurement: {
    id?: string;
    userId: string;
    metric: string;
    value: number;
    date: string;
    age: number;
    units: string;
    notes?: string;
  };
  athlete: string;
  rawText: string;
  confidence: number;
}

export interface ImportError {
  row: number;
  error: string;
  data?: {
    rawText?: string;
    extractedData?: Partial<ExtractedMeasurementData>;
  };
}

export interface ExtractedMeasurementData {
  firstName?: string;
  lastName?: string;
  metric?: string;
  value?: string;
  date?: string;
  age?: string;
  confidence: number;
  rawText: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  extractedData: ExtractedMeasurementData[];
  warnings: string[];
}

export interface OCRConfig {
  confidenceThreshold: number;
  maxFileSize: number;
  allowedMimeTypes: string[];
  imageProcessing: {
    enabled: boolean;
    greyscale: boolean;
    normalize: boolean;
    sharpen: boolean;
    convertToPng: boolean;
  };
  validation: {
    measurementRanges: Record<string, { min: number; max: number }>;
    nameMinLength: number;
    dateFormats: string[];
  };
}

// Validation schemas
export const extractedMeasurementSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  metric: z.string().optional(),
  value: z.string().optional(),
  date: z.string().optional(),
  age: z.string().optional(),
  confidence: z.number().min(0).max(100),
  rawText: z.string(),
});

export const ocrConfigSchema = z.object({
  confidenceThreshold: z.number().min(0).max(100).default(50),
  maxFileSize: z.number().positive().default(10 * 1024 * 1024),
  allowedMimeTypes: z.array(z.string()).default([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'
  ]),
  imageProcessing: z.object({
    enabled: z.boolean().default(true),
    greyscale: z.boolean().default(true),
    normalize: z.boolean().default(true),
    sharpen: z.boolean().default(true),
    convertToPng: z.boolean().default(true),
  }).default({}),
  validation: z.object({
    measurementRanges: z.record(z.object({
      min: z.number(),
      max: z.number(),
    })).default({
      'DASH_40YD': { min: 3.0, max: 8.0 },
      'FLY10_TIME': { min: 0.8, max: 3.0 },
      'VERTICAL_JUMP': { min: 10, max: 50 },
      'AGILITY_505': { min: 1.5, max: 4.0 },
      'AGILITY_5105': { min: 2.0, max: 6.0 },
      'T_TEST': { min: 7.0, max: 15.0 },
      'RSI': { min: 0.5, max: 5.0 },
    }),
    nameMinLength: z.number().min(1).default(2),
    dateFormats: z.array(z.string()).default([
      'MM/DD/YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY'
    ]),
  }).default({}),
}).default({});

export type OCRConfigInferred = z.infer<typeof ocrConfigSchema>;
export type ExtractedMeasurementDataInferred = z.infer<typeof extractedMeasurementSchema>;