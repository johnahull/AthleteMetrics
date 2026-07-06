/**
 * Import/Export routes - handles CSV/photo import and data export endpoints
 * Extracted from routes.ts for better maintainability
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { sanitizeCSVValue } from "../utils/csv-utils";
import { ocrService } from "../ocr/ocr-service";
import { reviewQueue } from "../review-queue";
import { findBestAthleteMatch, type MatchingCriteria, type MatchResult } from "../athlete-matching";
import { isSiteAdmin } from "@shared/auth-utils";
import { METRIC_CONFIG } from "@shared/analytics-types";
import { COMMON_METRICS, type ImportResult } from "@shared/import-types";
import { globalAthleteService } from "../services/global-athlete-service";
import { isValidEmail } from "@shared/email-validation";
import { templateGeneratorService } from "../services/template-generator-service";
import { metricService } from "../services/metric-service";
import { getPgErrorCode, PG_UNIQUE_VIOLATION } from "../lib/pg-error";
import { importValidationService, type ValidationContext } from "../services/import-validation-service";
import { logAuthorizationFailure } from "../helpers/audit-logging";
import { getCachedUserOrganizations } from "../helpers/cached-org-access";
import type { SiteMetric } from "@shared/schema";
import { DerivedMetricCalculator } from "../services/derived-metric-calculator";
import { db } from "../db";

/**
 * Tenant-isolation guard for imports. A client-supplied organizationId must be
 * one the caller actually belongs to (site admins may target any organization).
 * Returns an error message when access is denied, or null when allowed. Callers
 * must run this BEFORE any read/preview or write scoped to that organization.
 */
async function checkImportOrgAccess(
  currentUser: { id: string; isSiteAdmin?: boolean } | undefined,
  organizationId: string | undefined,
): Promise<string | null> {
  if (!organizationId) return null;
  if (!currentUser?.id) return "User not authenticated";
  if (currentUser.isSiteAdmin) return null;
  const userOrgs = await storage.getUserOrganizations(currentUser.id);
  const allowed = userOrgs.some((o) => o.organizationId === organizationId);
  return allowed ? null : "You do not have access to import into this organization";
}

/**
 * After a weight or height measurement is created, sync the value to the user's profile.
 * Uses the measurement's unit to convert to the profile's storage format (lbs / inches).
 */
async function syncPhysicalMetricToProfile(
  userId: string,
  metricCode: string,
  value: number,
  unit: string,
): Promise<void> {
  if (!isFinite(value)) return;

  const code = metricCode.toUpperCase();
  const unitLower = (unit || '').toLowerCase();

  // Detect weight metrics — only trigger on metric codes that contain 'WEIGHT'
  if (code.includes('WEIGHT')) {
    let weightLbs: number;
    if (unitLower === 'kg') {
      weightLbs = value * 2.20462;
    } else if (unitLower === 'lbs' || unitLower === 'lb') {
      weightLbs = value;
    } else {
      console.warn(`[PROFILE SYNC] Unknown weight unit '${unit}' for ${metricCode} — skipping profile sync`);
      return;
    }
    await storage.updateUser(userId, { weight: Math.round(weightLbs) });
    return;
  }

  // Detect height metrics — only trigger on metric codes that contain 'HEIGHT'
  if (code.includes('HEIGHT')) {
    let heightIn: number;
    if (unitLower === 'cm') {
      heightIn = value / 2.54;
    } else if (unitLower === 'in' || unitLower === 'inches') {
      heightIn = value;
    } else {
      console.warn(`[PROFILE SYNC] Unknown height unit '${unit}' for ${metricCode} — skipping profile sync`);
      return;
    }
    await storage.updateUser(userId, { height: Math.round(heightIn) });
  }
}

// MeasurementFilters interface
interface MeasurementFilters {
  userId?: string;
  athleteId?: string;
  playerId?: string;
  teamIds?: string[];
  organizationId?: string;
  metric?: string;
  dateFrom?: string;
  dateTo?: string;
  birthYearFrom?: number;
  birthYearTo?: number;
  ageFrom?: number;
  ageTo?: number;
  search?: string;
  sport?: string;
  gender?: string;
  position?: string;
  includeUnverified?: boolean;
}

// Helper to get default unit for a metric
// Prioritizes DB-defined metrics, falls back to legacy METRIC_CONFIG for backwards compatibility
const getDefaultUnit = (metric: string, metricsMap?: Map<string, SiteMetric>): string => {
  if (metricsMap) {
    const siteMetric = metricsMap.get(metric.toUpperCase());
    if (siteMetric && siteMetric.unit !== null) return siteMetric.unit;
  }
  // Fallback to legacy METRIC_CONFIG for backwards compatibility
  const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];
  // Use nullish coalescing to allow empty string units (e.g., RSI)
  return config?.unit ?? 's'; // Default to seconds if metric not found
};

// Phone number validation function
const isValidPhoneNumber = (value: string): boolean => {
  // Remove all non-digit characters for validation
  const cleaned = value.replace(/\D/g, '');
  // Support various formats:
  // - US/Canada: 10 digits or 1 + 10 digits
  // - International: 7-15 digits, optionally starting with +
  // - Extensions are not supported in this simplified version
  return /^(\+?1?\d{10}|\+?\d{7,15})$/.test(cleaned) && cleaned.length >= 7 && cleaned.length <= 15;
};

// Smart data placement function - detects emails and phone numbers regardless of column
const smartPlaceContactData = (row: any): { emails: string[], phoneNumbers: string[], warnings: string[] } => {
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
};

// Rate limiting for upload endpoints
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: parseInt(process.env.UPLOAD_RATE_LIMIT || '20'),
  message: { message: "Too many upload requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'upload'),
});

// SECURITY: Configure multer for CSV file uploads with strict validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_CSV_FILE_SIZE || '5242880'), // Default 5MB (5 * 1024 * 1024)
    files: 1, // Only allow single file uploads
  },
  fileFilter: (req, file, cb) => {
    // SECURITY: Strict file type validation - check both MIME type and extension
    const allowedMimeTypes = ['text/csv', 'application/csv', 'text/plain'];
    const hasValidMime = allowedMimeTypes.includes(file.mimetype);
    const hasValidExtension = file.originalname.toLowerCase().endsWith('.csv');

    if (hasValidMime && hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV files are allowed.'));
    }
  }
});
// NOTE: For production deployments, consider adding virus scanning middleware
// (e.g., ClamAV integration) before processing uploaded files

// SECURITY: Configure multer for image uploads (OCR) with strict validation
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_IMAGE_FILE_SIZE || '10485760'), // Default 10MB (10 * 1024 * 1024)
    files: 1, // Only allow single file uploads
  },
  fileFilter: (req, file, cb) => {
    // SECURITY: Strict file type validation for images and PDFs
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const fileExtension = file.originalname.toLowerCase().match(/\.[^.]*$/)?.[0] || '';

    const hasValidMime = allowedMimes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.includes(fileExtension);

    if (hasValidMime && hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only image files (JPG, PNG, WebP) and PDF files are allowed.'));
    }
  }
});

export function registerImportExportRoutes(app: Express) {
  // Photo OCR upload route (must come before generic import route)
  app.post("/api/import/photo", uploadLimiter, requireAuth, imageUpload.single('file'), async (req, res) => {
    try {
      const currentUser = req.session.user;
      const file = req.file;

      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Athletes cannot upload photos for import
      if (currentUser?.role === "athlete") {
        return res.status(403).json({ message: "Athletes cannot import measurement data" });
      }

      if (!file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      // Parse import options
      const optionsJson = req.body.options;
      let options;
      try {
        options = optionsJson ? JSON.parse(optionsJson) : {
          measurementMode: 'match_only',
          teamHandling: 'auto_create_confirm',
          organizationId: undefined
        };
      } catch (error) {
        console.error('JSON parse error for import options:', error);
        return res.status(400).json({ message: "Invalid options JSON format" });
      }

      const measurementMode = options.measurementMode || 'match_only';
      const teamHandling = options.teamHandling || 'auto_create_confirm';

      // Tenant isolation: reject a client-supplied organizationId the caller
      // does not belong to before any org-scoped read or write.
      const photoOrgAccessError = await checkImportOrgAccess(currentUser, options.organizationId);
      if (photoOrgAccessError) {
        return res.status(403).json({ message: photoOrgAccessError });
      }

      // Debug logging removed for production: Processing OCR for file

      // Extract text and data using OCR
      const ocrResult = await ocrService.extractTextFromImage(file.buffer);

      // Debug logging removed for production: OCR completed with confidence and extracted measurements

      // Convert extracted data to the same format as CSV import
      const processedData: any[] = [];
      const errors: any[] = [];
      const warnings: string[] = [...ocrResult.warnings];
      const createdAthletes: any[] = [];

      for (let i = 0; i < ocrResult.extractedData.length; i++) {
        const extracted = ocrResult.extractedData[i];
        const rowNum = i + 1;

        try {
          if (!extracted.firstName || !extracted.lastName || !extracted.metric || !extracted.value) {
            errors.push({
              row: rowNum,
              error: `Incomplete data: ${extracted.rawText}`,
              data: extracted
            });
            continue;
          }

          // Validate and clean the measurement value
          const numericValue = parseFloat(extracted.value);
          if (isNaN(numericValue) || numericValue <= 0) {
            errors.push({
              row: rowNum,
              error: `Invalid measurement value: ${extracted.value}`,
              data: extracted
            });
            continue;
          }

          // Find or create the athlete
          const athletes = await storage.getAthletes({
            search: `${extracted.firstName} ${extracted.lastName}`
          });

          let userId: string | null = null;
          let athleteCreated = false;

          if (athletes.length > 0) {
            // Found existing athlete(s)
            const exactMatch = athletes.find(a =>
              a.firstName.toLowerCase() === extracted.firstName!.toLowerCase() &&
              a.lastName.toLowerCase() === extracted.lastName!.toLowerCase()
            );

            if (exactMatch) {
              userId = exactMatch.id;
            } else {
              // Partial match - suggest the closest one
              userId = athletes[0].id;
              warnings.push(`Using closest match for ${extracted.firstName} ${extracted.lastName}: ${athletes[0].firstName} ${athletes[0].lastName}`);
            }
          } else {
            // No match found - check if we should create
            if (measurementMode === 'create_athletes') {
              // Create the athlete (OCR doesn't extract team info currently)
              const newAthlete = await storage.createUser({
                firstName: extracted.firstName!,
                lastName: extracted.lastName!,
                emails: [`${extracted.firstName?.toLowerCase()}.${extracted.lastName?.toLowerCase()}@ocr-import.local`],
                username: `${extracted.firstName?.toLowerCase()}_${extracted.lastName?.toLowerCase()}_${Date.now()}`,
                role: 'athlete' as const,
                password: 'INVITATION_PENDING',
                isActive: false
              });

              userId = newAthlete.id;
              athleteCreated = true;
              createdAthletes.push({ id: newAthlete.id, name: `${newAthlete.firstName} ${newAthlete.lastName}` });

              // Add to organization if specified
              if (options.organizationId) {
                try {
                  await storage.addUserToOrganization(userId, options.organizationId, 'athlete');
                } catch (error) {
                  console.warn(`Could not add athlete ${userId} to organization ${options.organizationId}:`, error);
                }
              }
            } else {
              // Match-only mode - error if not found
              errors.push({
                row: rowNum,
                error: `Athlete not found: ${extracted.firstName} ${extracted.lastName}. Enable "Create athletes if needed" to auto-create.`,
                data: extracted
              });
              continue;
            }
          }

          // Calculate age if not provided
          let age = extracted.age ? parseInt(extracted.age) : undefined;
          if (!age && extracted.date) {
            const user = await storage.getUser(userId);
            if (user?.birthDate) {
              const measurementDate = new Date(extracted.date);
              const birthDate = new Date(user.birthDate);
              age = measurementDate.getFullYear() - birthDate.getFullYear();
              if (measurementDate < new Date(measurementDate.getFullYear(), birthDate.getMonth(), birthDate.getDate())) {
                age -= 1;
              }
            }
          }

          // Use current date if no date extracted
          const measurementDate = extracted.date || new Date().toISOString().split('T')[0];

          // Create measurement data
          const measurementData = {
            userId: userId,
            date: measurementDate,
            metric: extracted.metric as any,
            value: numericValue,
            age: age || 18, // Default age if we can't determine it
            notes: `OCR Import - Raw: ${extracted.rawText} (Confidence: ${extracted.confidence}%)`
          };

          // Create the measurement
          const measurement = await storage.createMeasurement(measurementData, currentUser.id);

          // DERIVED METRICS: Trigger automatic calculation of derived metrics
          try {
            const calculator = new DerivedMetricCalculator(db);
            await calculator.processNewMeasurement(measurement, {
              event: 'bulk_import',
              userId: currentUser.id,
              sourceMeasurementId: measurement.id,
            });
          } catch (derivedError) {
            console.warn(`[OCR IMPORT] Derived metric calculation failed for measurement ${measurement.id}:`, derivedError);
          }

          // PROFILE SYNC: Update user profile weight/height when physical metrics are imported
          try {
            await syncPhysicalMetricToProfile(
              userId,
              measurement.metric,
              parseFloat(measurement.value),
              measurement.units || '',
            );
          } catch (syncError) {
            console.warn(`[OCR IMPORT] Profile sync failed for measurement ${measurement.id}:`, syncError);
          }

          processedData.push({
            measurement,
            athlete: `${extracted.firstName} ${extracted.lastName}`,
            rawText: extracted.rawText,
            confidence: extracted.confidence
          });

        } catch (error) {
          console.error(`Error processing measurement ${rowNum}:`, error);
          errors.push({
            row: rowNum,
            error: `Processing failed: ${error}`,
            data: extracted
          });
        }
      }

      res.json({
        success: true,
        message: `OCR processing completed`,
        results: {
          totalExtracted: ocrResult.extractedData.length,
          successful: processedData.length,
          failed: errors.length,
          ocrConfidence: ocrResult.confidence,
          extractedText: ocrResult.text,
          processedData,
          errors,
          warnings,
          createdAthletes: createdAthletes.length > 0 ? createdAthletes : undefined
        }
      });

    } catch (error) {
      console.error("Photo OCR import error:", error);
      res.status(500).json({
        message: "Failed to process image",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Import routes

  // Parse CSV and return headers with suggested mappings
  app.post("/api/import/parse-csv", uploadLimiter, requireAuth, upload.single('file'), async (req, res) => {
    try {
      const { type } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Parse CSV headers
      const csvText = file.buffer.toString('utf-8');
      const lines = csvText.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      // Parse first 20 rows for preview
      const rows: any[] = [];
      const maxPreviewRows = Math.min(20, lines.length - 1);

      for (let i = 1; i <= maxPreviewRows; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        rows.push(row);
      }

      // Auto-detect column mappings
      const systemFields = type === 'athletes'
        ? ['firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear', 'gender', 'emails', 'phoneNumbers', 'sports', 'position', 'height', 'weight', 'school', 'teamName']
        : ['firstName', 'lastName', 'teamName', 'date', 'age', 'metric', 'value', 'units', 'flyInDistance', 'notes', 'gender'];

      const suggestedMappings: any[] = [];

      // Simple auto-detection based on column name similarity
      headers.forEach(csvColumn => {
        const normalized = csvColumn.toLowerCase().replace(/[\s_-]/g, '');

        for (const systemField of systemFields) {
          const normalizedSystem = systemField.toLowerCase().replace(/[\s_-]/g, '');

          if (normalized === normalizedSystem ||
              normalized.includes(normalizedSystem) ||
              normalizedSystem.includes(normalized)) {
            suggestedMappings.push({
              csvColumn,
              systemField,
              isRequired: ['firstName', 'lastName', 'date', 'metric', 'value'].includes(systemField),
              autoDetected: true
            });
            break;
          }
        }
      });

      res.json({
        headers,
        rows,
        suggestedMappings
      });
    } catch (error) {
      console.error('CSV parse error:', error);
      res.status(500).json({ message: "Failed to parse CSV", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/import/:type", uploadLimiter, requireAuth, upload.single('file'), async (req, res) => {
    try {
      const { type } = req.params;
      const { createMissing, teamId, preview, confirmData, options: optionsJson } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      if (type !== 'athletes' && type !== 'measurements') {
        return res.status(400).json({ message: "Invalid import type. Use 'athletes' or 'measurements'" });
      }

      // Parse import options
      let options;
      try {
        options = optionsJson ? JSON.parse(optionsJson) : {
          athleteMode: 'smart_import',
          measurementMode: 'match_only',
          teamHandling: 'auto_create_confirm',
          updateExisting: true,
          skipDuplicates: false
        };
      } catch (error) {
        console.error('JSON parse error for CSV import options:', error);
        return res.status(400).json({ message: "Invalid options JSON format" });
      }

      // Tenant isolation: reject a client-supplied organizationId the caller
      // does not belong to before any org-scoped read/preview or write.
      const importOrgAccessError = await checkImportOrgAccess(req.session.user, options.organizationId);
      if (importOrgAccessError) {
        return res.status(403).json({ message: importOrgAccessError });
      }

      const results: any[] = [];
      const errors: any[] = [];
      const warnings: any[] = [];
      let totalRows = 0;
      let createdCount = 0;
      let updatedCount = 0;
      let matchedCount = 0;
      let skippedCount = 0;

      // Track created teams and athletes
      const createdTeams = new Map<string, { id: string, name: string, athleteCount: number }>();
      const createdAthletes: Array<{ id: string, name: string }> = [];

      // Parse CSV data
      const csvData: any[] = [];
      const csvText = file.buffer.toString('utf-8');

      // Split CSV into lines and parse
      const lines = csvText.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        return res.status(400).json({ message: "CSV file is empty" });
      }

      // SECURITY: Enforce row limit to prevent memory exhaustion
      const MAX_CSV_ROWS = parseInt(process.env.MAX_CSV_ROWS || '10000');
      if (lines.length - 1 > MAX_CSV_ROWS) {
        return res.status(400).json({
          message: `CSV file exceeds maximum row limit. Maximum ${MAX_CSV_ROWS} rows allowed, but file contains ${lines.length - 1} data rows.`
        });
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: any = {};
        headers.forEach((header, index) => {
          // Apply sanitization to prevent CSV formula injection
          row[header] = sanitizeCSVValue(values[index] || '');
        });
        csvData.push(row);
        totalRows++;
      }

      // Preview mode: analyze teams and return preview data
      if (preview === 'true' && type === 'athletes') {
        const teamMap = new Map<string, { athleteNames: string[], athleteCount: number }>();

        // Extract team information from CSV
        for (const row of csvData) {
          const { firstName, lastName, teamName } = row;
          if (teamName && teamName.trim()) {
            const normalizedTeamName = teamName.trim();
            if (!teamMap.has(normalizedTeamName)) {
              teamMap.set(normalizedTeamName, { athleteNames: [], athleteCount: 0 });
            }
            const teamInfo = teamMap.get(normalizedTeamName)!;
            teamInfo.athleteNames.push(`${firstName} ${lastName}`);
            teamInfo.athleteCount++;
          }
        }

        // Get current user's organization context
        const currentUser = req.session.user!;
        let organizationId: string | undefined;
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        organizationId = userOrgs[0]?.organizationId;

        // Check which teams exist
        const allTeams = await storage.getTeams();
        const missingTeams: any[] = [];

        for (const [teamName, info] of teamMap.entries()) {
          const existingTeam = allTeams.find(t =>
            t.name?.toLowerCase().trim() === teamName.toLowerCase().trim() &&
            (!organizationId || t.organization?.id === organizationId)
          );

          if (!existingTeam) {
            missingTeams.push({
              teamName,
              exists: false,
              athleteCount: info.athleteCount,
              athleteNames: info.athleteNames
            });
          }
        }

        return res.json({
          type: 'athletes',
          totalRows,
          missingTeams,
          previewData: csvData,
          requiresConfirmation: missingTeams.length > 0
        });
      }

      if (type === 'athletes') {
        // PERFORMANCE: Pre-load all athletes to avoid N+1 query problem
        // Instead of querying database for each CSV row, load all athletes once and use in-memory lookup
        let organizationId: string | undefined = options.organizationId;
        if (!organizationId) {
          const currentUser = req.session.user!;
          const userOrgs = await storage.getUserOrganizations(currentUser.id);
          organizationId = userOrgs[0]?.organizationId;
        }

        const allAthletes = organizationId
          ? await storage.getAthletes({ organizationId })
          : await storage.getAthletes();

        // Create fast lookup map: "firstname:lastname" => athlete
        const athleteMap = new Map(
          allAthletes.map(a => [
            `${a.firstName.toLowerCase()}:${a.lastName.toLowerCase()}`,
            a
          ])
        );

        // Load validation context for sports and position validation
        const validationContext = await importValidationService.loadValidationContext();

        // Process athletes import
        for (let i = 0; i < csvData.length; i++) {
          const row = csvData[i];
          const rowNum = i + 2; // Account for header row
          try {
            const { firstName, lastName, birthDate, birthYear, graduationYear, emails, phoneNumbers, sports, position, height, weight, school, teamName, gender } = row;

            if (!firstName || !lastName) {
              errors.push({ row: rowNum, error: "First name and last name are required" });
              continue;
            }

            // REQUIRE team assignment in CSV
            if (!teamName || !teamName.trim()) {
              errors.push({ row: rowNum, error: `Team name is required for ${firstName} ${lastName}. All athletes must be assigned to a team.` });
              continue;
            }

            // Validate gender field if provided
            let validatedGender: string | undefined;
            if (gender && gender.trim()) {
              const trimmedGender = gender.trim();
              if (['Male', 'Female', 'Not Specified'].includes(trimmedGender)) {
                validatedGender = trimmedGender;
              } else {
                warnings.push({
                  row: `Row ${rowNum} (${firstName} ${lastName})`,
                  warning: `Invalid gender value '${trimmedGender}'. Using 'Not Specified' instead. Valid values: Male, Female, Not Specified`
                });
                validatedGender = 'Not Specified';
              }
            }

            // Smart contact data detection and placement
            const contactData = smartPlaceContactData(row);
            const emailArray = contactData.emails;
            const phoneArray = contactData.phoneNumbers;

            // Add any warnings to import results for user feedback
            if (contactData.warnings.length > 0) {
              contactData.warnings.forEach(warning => {
                warnings.push({
                  row: `Row ${rowNum} (${firstName} ${lastName})`,
                  warning: warning
                });
              });
            }

            // Validate and filter sports
            const sportsInput = sports ? sports.split(';').map((s: string) => s.trim()).filter(Boolean) : [];
            const validatedSports: string[] = [];

            for (const sportCode of sportsInput) {
              const validationResult = importValidationService.validateSportCode(sportCode, validationContext);

              if (validationResult.valid && validationResult.value) {
                validatedSports.push(validationResult.value.code);
              } else if (validationResult.warning) {
                warnings.push({
                  row: `Row ${rowNum} (${firstName} ${lastName})`,
                  warning: validationResult.warning
                });
              }
            }

            const sportsArray = validatedSports;

            // Validate position against athlete's sports
            let validatedPosition: string | undefined;

            if (position && position.trim()) {
              if (validatedSports.length === 0) {
                warnings.push({
                  row: `Row ${rowNum} (${firstName} ${lastName})`,
                  warning: `Position '${position}' cannot be assigned without valid sports`
                });
              } else {
                let positionValid = false;

                // Check if position is valid for ANY of the athlete's sports
                for (const sportCode of validatedSports) {
                  const positionResult = importValidationService.validatePositionCode(
                    sportCode,
                    position,
                    validationContext
                  );

                  if (positionResult.valid && positionResult.value) {
                    validatedPosition = positionResult.value.code;
                    positionValid = true;
                    break;
                  }
                }

                // If position not valid for any sport, generate warning
                if (!positionValid) {
                  warnings.push({
                    row: `Row ${rowNum} (${firstName} ${lastName})`,
                    warning: `Position '${position}' is not valid for athlete's sports (${validatedSports.join(', ')})`
                  });
                }
              }
            }

            // Generate username
            const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
            let username = baseUsername;
            let counter = 1;
            while (await storage.getUserByUsername(username)) {
              username = `${baseUsername}${counter}`;
              counter++;
            }

            const athleteData = {
              username,
              firstName,
              lastName,
              emails: emailArray.length > 0 ? emailArray : [`${username}@temp.local`],
              phoneNumbers: phoneArray,
              birthDate: birthDate || undefined,
              birthYear: birthYear && !isNaN(parseInt(birthYear)) ? parseInt(birthYear) : (birthDate ? new Date(birthDate).getFullYear() : undefined),
              graduationYear: graduationYear && !isNaN(parseInt(graduationYear)) ? parseInt(graduationYear) : undefined,
              sports: sportsArray,
              positions: validatedPosition ? [validatedPosition] : undefined,
              height: height && !isNaN(parseInt(height)) ? parseInt(height) : undefined,
              weight: weight && !isNaN(parseInt(weight)) ? parseInt(weight) : undefined,
              school: school || undefined,
              gender: validatedGender,
              password: 'INVITATION_PENDING', // Inactive until invited
              isActive: false,
              role: "athlete"
            };

            // Get organization context
            let organizationId: string | undefined = options.organizationId;
            if (!organizationId) {
              const currentUser = req.session.user!;
              const userOrgs = await storage.getUserOrganizations(currentUser.id);
              organizationId = userOrgs[0]?.organizationId;
            }

            // Handle team resolution
            let targetTeamId: string | undefined = teamId; // Legacy default

            if (teamName && teamName.trim()) {
              const normalizedTeamName = teamName.trim();
              const allTeams = await storage.getTeams();
              let team = allTeams.find(t =>
                t.name?.toLowerCase().trim() === normalizedTeamName.toLowerCase().trim() &&
                (!organizationId || t.organization?.id === organizationId)
              );

              // Handle team creation based on teamHandling mode
              if (!team) {
                if (options.teamHandling === 'auto_create_silent' ||
                    (options.teamHandling === 'auto_create_confirm' && confirmData)) {
                  // Create team automatically
                  if (organizationId) {
                    // SECURITY: Verify user has permission to create teams in this organization
                    const currentUser = req.session.user!;
                    const userIsSiteAdmin = isSiteAdmin(currentUser);

                    if (!userIsSiteAdmin) {
                      // Check if user belongs to the target organization AND has proper role
                      const userOrgs = await storage.getUserOrganizations(currentUser.id);
                      const orgMembership = userOrgs.find(org => org.organizationId === organizationId);

                      if (!orgMembership) {
                        errors.push({
                          row: rowNum,
                          error: `Unauthorized: Cannot create team "${normalizedTeamName}". User does not belong to this organization.`
                        });
                        continue;
                      }

                      // SECURITY: Only org_admin and coach roles can create teams
                      if (!['org_admin', 'coach'].includes(orgMembership.role)) {
                        errors.push({
                          row: rowNum,
                          error: `Unauthorized: Role '${orgMembership.role}' cannot create teams. Only organization admins and coaches can create teams.`
                        });
                        continue;
                      }
                    }

                    // CONCURRENCY: Handle race condition where another request creates the same team
                    try {
                      const newTeam = await storage.createTeam({
                        organizationId,
                        name: normalizedTeamName,
                        level: undefined,
                        notes: 'Auto-created during athlete import'
                      });
                      team = newTeam as any;

                      if (!createdTeams.has(normalizedTeamName)) {
                        createdTeams.set(normalizedTeamName, {
                          id: newTeam.id,
                          name: newTeam.name,
                          athleteCount: 0
                        });
                      }
                      createdTeams.get(normalizedTeamName)!.athleteCount++;
                    } catch (createError: any) {
                      // Check if this is a unique constraint violation (team was created by concurrent request).
                      // drizzle-orm >=0.44 wraps driver errors in DrizzleQueryError, moving the
                      // original PostgreSQL error (with .code) onto .cause.
                      const pgCode = getPgErrorCode(createError);
                      if (pgCode === PG_UNIQUE_VIOLATION || createError.message?.includes('unique')) {
                        // Re-fetch the team that was just created by another request
                        const allTeams = await storage.getTeams();
                        team = allTeams.find(t =>
                          t.name?.toLowerCase().trim() === normalizedTeamName.toLowerCase().trim() &&
                          t.organization?.id === organizationId
                        );

                        if (!team) {
                          // Team should exist but wasn't found - this is unexpected
                          errors.push({
                            row: rowNum,
                            error: `Failed to create or find team "${normalizedTeamName}" after concurrent creation attempt`
                          });
                          continue;
                        }
                      } else {
                        // Different error - rethrow
                        throw createError;
                      }
                    }
                  }
                } else if (options.teamHandling === 'require_existing') {
                  errors.push({ row: rowNum, error: `Team "${normalizedTeamName}" does not exist and team creation is disabled` });
                  continue;
                }
                // For 'leave_teamless', team remains undefined
              }

              if (team) {
                targetTeamId = team.id;
              }
            }

            // Mode-specific athlete handling
            let athlete;
            let action: string;
            const athleteMode = options.athleteMode || 'smart_import';

            if (athleteMode === 'create_only') {
              // Always create new athlete, never match
              athlete = await storage.createUser(athleteData as any);
              action = 'created';
              createdAthletes.push({
                id: athlete.id,
                name: `${athlete.firstName} ${athlete.lastName}`
              });

            } else {
              // PERFORMANCE: Use pre-loaded athlete map instead of database query
              const lookupKey = `${firstName.toLowerCase()}:${lastName.toLowerCase()}`;
              const matchedAthlete = athleteMap.get(lookupKey);

              if (matchedAthlete) {
                // Found existing athlete
                athlete = matchedAthlete;

                if (athleteMode === 'smart_import' || athleteMode === 'match_and_update') {
                  // Update athlete info
                  if (options.updateExisting !== false) {
                    await storage.updateUser(athlete.id, {
                      birthDate: athleteData.birthDate,
                      birthYear: athleteData.birthYear,
                      graduationYear: athleteData.graduationYear,
                      sports: athleteData.sports,
                      height: athleteData.height,
                      weight: athleteData.weight,
                      school: athleteData.school,
                      gender: athleteData.gender
                    } as any);
                    action = 'updated';
                  } else {
                    action = 'matched';
                  }
                } else {
                  // match_only mode - just match without updating
                  action = 'matched';
                }

              } else {
                // No existing athlete found
                if (athleteMode === 'smart_import' || athleteMode === 'create_only') {
                  // Create new athlete for smart_import and create_only modes
                  athlete = await storage.createUser(athleteData as any);
                  action = 'created';
                  createdAthletes.push({
                    id: athlete.id,
                    name: `${athlete.firstName} ${athlete.lastName}`
                  });

                  // PERFORMANCE: Add newly created athlete to map for future lookups in this import
                  const newAthleteKey = `${athlete.firstName.toLowerCase()}:${athlete.lastName.toLowerCase()}`;
                  athleteMap.set(newAthleteKey, { ...athlete, teams: [] });
                } else {
                  // match_and_update or match_only - error if not found
                  errors.push({ row: rowNum, error: `Athlete ${firstName} ${lastName} not found (mode: ${athleteMode})` });
                  continue;
                }
              }
            }

            // Add athlete to organization first (if we have one)
            if (athlete && organizationId && action === 'created') {
              try {
                await storage.addUserToOrganization(athlete.id, organizationId, 'athlete');
              } catch (error) {
                // Organization membership might already exist, that's okay
                console.warn(`Could not add athlete ${athlete.id} to organization ${organizationId}:`, error);
              }

              // Auto-link athlete to global athlete identity if they have a real email
              if (athlete.emails?.[0]) {
                try {
                  await globalAthleteService.linkAthleteByEmail(athlete.id, athlete.emails[0]);
                } catch (error) {
                  // Don't fail the import - linking is a non-critical enhancement
                  console.warn(`[CSV IMPORT] Failed to auto-link athlete ${athlete.id} to global identity:`, error);
                }
              }
            }

            // Add to team if specified
            if (targetTeamId && athlete) {
              try {
                await storage.addUserToTeam(athlete.id, targetTeamId);
              } catch (error) {
                // Team membership might already exist, that's okay
                console.warn(`Could not add athlete ${athlete.id} to team ${targetTeamId}:`, error);
              }
            }

            results.push({
              action,
              athlete: {
                id: athlete.id,
                name: `${athlete.firstName} ${athlete.lastName}`,
                username: athlete.username
              }
            });
          } catch (error) {
            console.error('Error processing athlete row:', error);
            errors.push({ row: rowNum, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      } else if (type === 'measurements') {
        // Load validation context for metric validation
        const validationContext = await importValidationService.loadValidationContext();

        // PERFORMANCE: Load teams once before the loop to avoid N+1 queries.
        // Tenant isolation: a non-site-admin may only match teams within their
        // own organizations, so a team name cannot resolve to another tenant's
        // team (which would attribute measurements to the wrong organization).
        const measurementImportUser = req.session.user;
        let allTeamsForMeasurements = await storage.getTeams();
        if (!measurementImportUser?.isSiteAdmin) {
          const callerOrgIds = new Set(
            (await storage.getUserOrganizations(measurementImportUser!.id)).map((o) => o.organizationId)
          );
          allTeamsForMeasurements = allTeamsForMeasurements.filter(
            (t) => t.organization?.id && callerOrgIds.has(t.organization.id)
          );
        }

        // Process measurements import
        for (let i = 0; i < csvData.length; i++) {
          const row = csvData[i];
          const rowNum = i + 2; // Account for header row
          try {
            const { firstName, lastName, teamName, date, age, metric, value, units, flyInDistance, notes, gender } = row;

            // Validate required fields
            if (!firstName || !lastName || !teamName || !date || !metric || !value) {
              errors.push({ row: rowNum, error: "First name, last name, team name, date, metric, and value are required" });
              continue;
            }

            // Validate metric code (permissive mode - generate warning but continue)
            const metricValidation = importValidationService.validateMetricCode(metric, validationContext);
            if (!metricValidation.valid && metricValidation.warning) {
              warnings.push(`Row ${rowNum}: ${metricValidation.warning}`);
            }

            // Get organization context and teamId for measurement
            let organizationId: string | undefined;
            let teamId: string | undefined;
            const currentUser = req.session.user!;
            if (teamName) {
              // Try to find the team to get organization context and teamId (reuse loaded teams)
              const team = allTeamsForMeasurements.find(t => t.name?.toLowerCase().trim() === teamName.toLowerCase().trim());
              organizationId = team?.organization?.id;
              teamId = team?.id; // Store teamId for measurement
            }
            if (!organizationId) {
              // Fallback to current user's primary organization
              const userOrgs = await storage.getUserOrganizations(currentUser.id);
              organizationId = userOrgs[0]?.organizationId;
            }

            // Use simplified athlete matching system with organization filtering
            const athletes = await storage.getAthletes({
              search: `${firstName} ${lastName}`,
              organizationId: organizationId
            });

            // Build matching criteria
            const matchingCriteria: MatchingCriteria = {
              firstName,
              lastName,
              teamName
            };

            // Find best match using advanced matching algorithm
            const matchResult: MatchResult = findBestAthleteMatch(matchingCriteria, athletes);

            let matchedAthlete;
            const measurementMode = options.measurementMode || 'match_only';

            if (matchResult.type === 'none') {
              // No suitable match found
              if (measurementMode === 'create_athletes') {
                // Auto-create athlete
                const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/[^a-z0-9]/g, '');
                let username = baseUsername;
                let counter = 1;
                while (await storage.getUserByUsername(username)) {
                  username = `${baseUsername}${counter}`;
                  counter++;
                }

                const newAthlete = await storage.createUser({
                  username,
                  firstName,
                  lastName,
                  emails: [`${username}@temp.local`],
                  phoneNumbers: [],
                  gender: gender || 'Not Specified',
                  password: 'INVITATION_PENDING',
                  isActive: false,
                  role: 'athlete'
                } as any);

                matchedAthlete = newAthlete;
                createdAthletes.push({
                  id: newAthlete.id,
                  name: `${firstName} ${lastName}`
                });

                // Add to team if specified
                if (teamName) {
                  const teams = await storage.getTeams();
                  let team = teams.find(t => t.name?.toLowerCase().trim() === teamName.toLowerCase().trim());

                  // Handle team creation if needed
                  if (!team && organizationId &&
                      (options.teamHandling === 'auto_create_silent' ||
                       options.teamHandling === 'auto_create_confirm')) {
                    const newTeam = await storage.createTeam({
                      organizationId,
                      name: teamName,
                      level: undefined,
                      notes: 'Auto-created during measurement import'
                    });
                    team = newTeam as any;

                    if (!createdTeams.has(teamName)) {
                      createdTeams.set(teamName, {
                        id: newTeam.id,
                        name: newTeam.name,
                        athleteCount: 0
                      });
                    }
                    createdTeams.get(teamName)!.athleteCount++;
                  }

                  if (team) {
                    try {
                      await storage.addUserToTeam(newAthlete.id, team.id);
                      if (team.organization?.id) {
                        await storage.addUserToOrganization(newAthlete.id, team.organization.id, 'athlete');
                      }
                    } catch (error) {
                      console.warn(`Could not add athlete to team:`, error);
                    }
                  }
                }

                warnings.push(`Row ${rowNum}: Created new athlete ${firstName} ${lastName}`);

              } else {
                // match_only mode - fail if not found
                let errorMsg = `No matching athlete found for ${firstName} ${lastName}`;
                if (teamName) {
                  errorMsg += ` in team "${teamName}"`;
                }

                // Suggest alternatives if available
                if (matchResult.alternatives && matchResult.alternatives.length > 0) {
                  const suggestions = matchResult.alternatives
                    .slice(0, 2)
                    .map(alt => `${alt.firstName} ${alt.lastName} (${alt.matchReason})`)
                    .join(', ');
                  errorMsg += `. Similar athletes found: ${suggestions}`;
                }

                errors.push({ row: rowNum, error: errorMsg });
                continue;
              }
            }

            // Handle review queue based on mode
            const shouldReview = measurementMode === 'review_all' ||
                                (measurementMode === 'review_low_confidence' &&
                                 (matchResult.requiresManualReview || matchResult.confidence < 75));

            if (shouldReview && matchResult.candidate) {
              // Add to review queue instead of processing immediately
              const reviewItem = reviewQueue.addItem({
                type: 'measurement',
                originalData: row,
                matchingCriteria,
                suggestedMatch: matchResult.candidate ? {
                  id: matchResult.candidate.id,
                  firstName: matchResult.candidate.firstName,
                  lastName: matchResult.candidate.lastName,
                  confidence: matchResult.confidence,
                  reason: matchResult.candidate.matchReason
                } : undefined,
                alternatives: matchResult.alternatives?.map(alt => ({
                  id: alt.id,
                  firstName: alt.firstName,
                  lastName: alt.lastName,
                  confidence: alt.matchScore,
                  reason: alt.matchReason
                })),
                createdBy: req.session.user!.id
              });

              results.push({
                action: 'pending_review',
                reviewItem: {
                  id: reviewItem.id,
                  reason: `Low confidence match (${matchResult.confidence}%) requires manual review`
                }
              });
              continue;
            }

            matchedAthlete = matchResult.candidate;

            if (!matchedAthlete) {
              errors.push({ row: rowNum, error: `No valid athlete match found for ${firstName} ${lastName}` });
              continue;
            }

            // Add warning for medium-confidence matches that were auto-approved
            if (matchResult.confidence < 90) {
              const warningMsg = `${firstName} ${lastName} matched to ${matchedAthlete.firstName} ${matchedAthlete.lastName} ` +
                `(confidence: ${matchResult.confidence}%, reason: ${matchedAthlete.matchReason})`;
              warnings.push(warningMsg);
            }

            const measurementData = {
              userId: matchedAthlete.id,
              date,
              age: age && !isNaN(parseInt(age)) ? parseInt(age) : undefined,
              metric,
              value: parseFloat(value),
              units: units || getDefaultUnit(metric, validationContext.metrics),
              flyInDistance: flyInDistance && !isNaN(parseInt(flyInDistance)) ? parseInt(flyInDistance) : undefined,
              notes: notes || undefined,
              teamId: teamId || undefined, // Pass teamId from CSV teamName lookup
              isVerified: "false"
            };

            const measurement = await storage.createMeasurement(measurementData, req.session.user!.id);

            // DERIVED METRICS: Trigger automatic calculation of derived metrics
            // This ensures metrics like BLOCK_REACH (=BLOCK_JUMP + STANDING_REACH) get calculated on import
            try {
              const calculator = new DerivedMetricCalculator(db);
              await calculator.processNewMeasurement(measurement, {
                event: 'bulk_import',
                userId: req.session.user!.id,
                sourceMeasurementId: measurement.id,
              });
            } catch (derivedError) {
              // Log but don't fail the import if derived metric calculation fails
              console.warn(`[CSV IMPORT] Derived metric calculation failed for measurement ${measurement.id}:`, derivedError);
            }

            // PROFILE SYNC: Update user profile weight/height when physical metrics are imported
            try {
              await syncPhysicalMetricToProfile(
                matchedAthlete.id,
                measurement.metric,
                parseFloat(measurement.value),
                measurement.units || '',
              );
            } catch (syncError) {
              console.warn(`[CSV IMPORT] Profile sync failed for measurement ${measurement.id}:`, syncError);
            }

            results.push({
              action: 'created',
              measurement: {
                id: measurement.id,
                athlete: `${matchedAthlete.firstName} ${matchedAthlete.lastName}`,
                metric: measurement.metric,
                value: measurement.value,
                date: measurement.date
              }
            });
          } catch (error) {
            console.error('Error processing measurement row:', error);
            errors.push({ row: rowNum, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        }
      }

      const pendingReviewCount = results.filter(r => r.action === 'pending_review').length;

      // Count different action types for summary
      createdCount = results.filter(r => r.action === 'created').length;
      updatedCount = results.filter(r => r.action === 'updated').length;
      matchedCount = results.filter(r => r.action === 'matched' || r.action === 'matched_and_deactivated').length;
      skippedCount = results.filter(r => r.action === 'skipped').length;

      if (errors.length > 0) {
        console.error(`[CSV IMPORT] ${errors.length} errors in ${type} import`);
      }

      const response: ImportResult = {
        type,
        totalRows,
        results,
        errors,
        warnings,
        summary: {
          successful: createdCount + updatedCount + matchedCount,
          created: createdCount,
          updated: updatedCount,
          matched: matchedCount,
          failed: errors.length,
          warnings: warnings.length,
          skipped: skippedCount,
          pendingReview: pendingReviewCount
        },
        options
      };

      // Add created teams if any
      if (createdTeams.size > 0) {
        response.createdTeams = Array.from(createdTeams.values());
      }

      // Add created athletes if any
      if (createdAthletes.length > 0) {
        response.createdAthletes = createdAthletes;
      }

      res.json(response);
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ message: "Import failed", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Review Queue endpoints
  app.get("/api/import/review-queue", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Get organization context for filtering (if needed)
      const organizationId = (currentUser as any)?.organizationId || '';

      const queue = reviewQueue.getPendingItems(organizationId);
      res.json(queue);
    } catch (error) {
      console.error('Review queue error:', error);
      res.status(500).json({ message: "Failed to fetch review queue", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/import/review-decision", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { itemId, action, selectedAthleteId, notes } = req.body;

      if (!itemId || !action) {
        return res.status(400).json({ message: "Item ID and action are required" });
      }

      // Validate action parameter
      if (!['approve', 'reject', 'select_alternative'].includes(action)) {
        return res.status(400).json({ message: "Invalid action. Must be 'approve', 'reject', or 'select_alternative'" });
      }

      if (action === 'select_alternative' && !selectedAthleteId) {
        return res.status(400).json({ message: "Selected athlete ID is required for select_alternative action" });
      }

      const decision = {
        itemId,
        action,
        selectedAthleteId,
        notes
      };

      const updatedItem = reviewQueue.processDecision(decision, currentUser.id);

      if (!updatedItem) {
        return res.status(404).json({ message: "Review item not found" });
      }

      // If approved, process the measurement
      if (updatedItem.status === 'approved') {
        try {
          const originalData = updatedItem.originalData;
          const athleteId = selectedAthleteId || updatedItem.suggestedMatch?.id;

          if (athleteId && updatedItem.type === 'measurement') {
            const measurementData = {
              userId: athleteId,
              date: originalData.date,
              age: originalData.age && !isNaN(parseInt(originalData.age)) ? parseInt(originalData.age) : undefined,
              metric: originalData.metric,
              value: parseFloat(originalData.value),
              units: originalData.units || getDefaultUnit(originalData.metric),
              flyInDistance: originalData.flyInDistance && !isNaN(parseInt(originalData.flyInDistance)) ? parseInt(originalData.flyInDistance) : undefined,
              notes: originalData.notes || `Approved from review queue by ${currentUser.firstName} ${currentUser.lastName}`,
              isVerified: "false"
            };

            const measurement = await storage.createMeasurement(measurementData, currentUser.id);

            // DERIVED METRICS: Trigger automatic calculation of derived metrics
            try {
              const calculator = new DerivedMetricCalculator(db);
              await calculator.processNewMeasurement(measurement, {
                event: 'bulk_import',
                userId: currentUser.id,
                sourceMeasurementId: measurement.id,
              });
            } catch (derivedError) {
              console.warn(`[REVIEW QUEUE] Derived metric calculation failed for measurement ${measurement.id}:`, derivedError);
            }

            // PROFILE SYNC: Update user profile weight/height when physical metrics are imported
            try {
              await syncPhysicalMetricToProfile(
                athleteId,
                measurement.metric,
                parseFloat(measurement.value),
                measurement.units || '',
              );
            } catch (syncError) {
              console.warn(`[REVIEW QUEUE] Profile sync failed for measurement ${measurement.id}:`, syncError);
            }

            res.json({
              success: true,
              item: updatedItem,
              measurement: {
                id: measurement.id,
                metric: measurement.metric,
                value: measurement.value,
                date: measurement.date
              }
            });
          } else {
            res.json({ success: true, item: updatedItem });
          }
        } catch (error) {
          console.error('Error processing approved measurement:', error);
          res.status(500).json({ message: "Failed to process approved measurement", error: error instanceof Error ? error.message : 'Unknown error' });
        }
      } else {
        res.json({ success: true, item: updatedItem });
      }
    } catch (error) {
      console.error('Review decision error:', error);
      res.status(500).json({ message: "Failed to process review decision", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Export routes
  app.get("/api/export/athletes", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Extract organizationId query parameter
      const { organizationId: requestedOrgId } = req.query;

      // Determine effective organization ID based on user permissions
      let effectiveOrganizationId: string | undefined;

      if (currentUser.isSiteAdmin) {
        // Site admins can export from all organizations or a specific one
        effectiveOrganizationId = requestedOrgId as string | undefined;
      } else {
        // Non-site-admin users can only export from their organization(s)
        const userOrgs = await storage.getUserOrganizations(currentUser.id);

        if (requestedOrgId) {
          // Validate user has access to requested organization
          const hasAccess = userOrgs.some(uo => uo.organizationId === requestedOrgId);
          if (!hasAccess) {
            return res.status(403).json({
              message: "You do not have access to export athletes from this organization"
            });
          }
          effectiveOrganizationId = requestedOrgId as string;
        } else {
          // Use user's first organization as default
          effectiveOrganizationId = userOrgs[0]?.organizationId;
        }
      }

      // Get athletes filtered by organization
      const athletes = await storage.getAthletes({ organizationId: effectiveOrganizationId });

      // Transform to CSV format matching import template
      // Headers match client/src/pages/import-export.tsx athletesTemplate (line 689)
      const csvHeaders = [
        'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
        'gender', 'emails', 'phoneNumbers', 'sports', 'position', 'height', 'weight',
        'school', 'teamName'
      ];

      // Check for multi-team athletes that will lose data in export
      const multiTeamAthletes = athletes.filter(athlete => athlete.teams && athlete.teams.length > 1);
      const hasMultiTeamAthletes = multiTeamAthletes.length > 0;

      const csvRows = athletes.map(athlete => {
        // Export first team only as "teamName" (singular) to match import format
        const teamName = athlete.teams && athlete.teams.length > 0 ? athlete.teams[0].name : '';
        const emails = Array.isArray(athlete.emails) ? athlete.emails.join(';') : (athlete.emails || '');
        const phoneNumbers = Array.isArray(athlete.phoneNumbers) ? athlete.phoneNumbers.join(';') : (athlete.phoneNumbers || '');
        const sports = Array.isArray(athlete.sports) ? athlete.sports.join(';') : (athlete.sports || '');
        const positions = Array.isArray(athlete.positions) ? athlete.positions.join(';') : (athlete.positions || '');

        return [
          athlete.firstName || '',
          athlete.lastName || '',
          athlete.birthDate || '',
          athlete.birthYear || '',
          athlete.graduationYear || '',
          athlete.gender || '',
          emails,
          phoneNumbers,
          sports,
          positions,
          athlete.height || '',
          athlete.weight || '',
          athlete.school || '',
          teamName
        ].map(field => {
          // SECURITY: Sanitize for formula injection, then escape for CSV format
          let value = String(field || '');
          value = sanitizeCSVValue(value);

          // Escape commas and quotes for CSV
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="athletes.csv"');

      // Warn if multi-team athletes have data loss
      if (hasMultiTeamAthletes) {
        res.setHeader('X-Export-Warning', `${multiTeamAthletes.length} athlete(s) with multiple teams; only first team exported`);
      }

      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting athletes:", error);
      res.status(500).json({ message: "Failed to export athletes" });
    }
  });

  app.get("/api/export/measurements", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Extract query parameters for filtering
      const {playerId, teamIds, metric, dateFrom, dateTo, birthYearFrom, birthYearTo, ageFrom, ageTo, search, sport, gender, organizationId } = req.query;

      // Determine effective organization ID based on user permissions
      let effectiveOrganizationId: string | undefined;

      if (currentUser.isSiteAdmin) {
        // Site admins can export from all organizations or a specific one
        effectiveOrganizationId = organizationId as string | undefined;
      } else {
        // Non-site-admin users can only export from their organization(s)
        const userOrgs = await storage.getUserOrganizations(currentUser.id);

        if (organizationId) {
          // Validate user has access to requested organization
          const hasAccess = userOrgs.some(uo => uo.organizationId === organizationId);
          if (!hasAccess) {
            return res.status(403).json({
              message: "You do not have access to export measurements from this organization"
            });
          }
          effectiveOrganizationId = organizationId as string;
        } else {
          // Use user's first organization as default
          effectiveOrganizationId = userOrgs[0]?.organizationId;
        }
      }

      const filters: MeasurementFilters = {
        playerId: playerId as string,
        teamIds: teamIds ? (teamIds as string).split(',') : undefined,
        metric: metric as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        birthYearFrom: birthYearFrom ? parseInt(birthYearFrom as string) : undefined,
        birthYearTo: birthYearTo ? parseInt(birthYearTo as string) : undefined,
        ageFrom: ageFrom ? parseInt(ageFrom as string) : undefined,
        ageTo: ageTo ? parseInt(ageTo as string) : undefined,
        search: search as string,
        sport: sport as string,
        gender: gender as string,
        organizationId: effectiveOrganizationId,
        includeUnverified: true
      };

      // Get measurements with filtering
      const measurements = await storage.getMeasurements(filters);

      // Transform to CSV format matching import template
      // Headers match client/src/pages/import-export.tsx measurementsTemplate (line 694)
      const csvHeaders = [
        'firstName', 'lastName', 'gender', 'teamName', 'date', 'age',
        'metric', 'value', 'units', 'flyInDistance', 'notes'
      ];

      // Check for measurements with multi-team users that will lose data in export
      const multiTeamMeasurements = measurements.filter(m => m.user?.teams && m.user.teams.length > 1);
      const hasMultiTeamMeasurements = multiTeamMeasurements.length > 0;

      const csvRows = measurements.map(measurement => {
        const user = measurement.user;
        // Export first team only as "teamName" (singular) to match import format
        const teamName = user?.teams && user.teams.length > 0 ? user.teams[0].name : '';

        return [
          user?.firstName || '',
          user?.lastName || '',
          user?.gender || '',
          teamName,
          measurement.date || '',
          measurement.age || '',
          measurement.metric || '',
          measurement.value || '',
          measurement.units || '',
          measurement.flyInDistance || '',
          measurement.notes || ''
        ].map(field => {
          // SECURITY: Sanitize for formula injection, then escape for CSV format
          let value = String(field || '');
          value = sanitizeCSVValue(value);

          // Escape commas and quotes for CSV
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="measurements.csv"');

      // Warn if measurements have multi-team users with data loss
      if (hasMultiTeamMeasurements) {
        res.setHeader('X-Export-Warning', `${multiTeamMeasurements.length} measurement(s) from athletes with multiple teams; only first team exported`);
      }

      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting measurements:", error);
      res.status(500).json({ message: "Failed to export measurements" });
    }
  });

  app.get("/api/export/teams", requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      // Transform to CSV format with all database fields
      const csvHeaders = [
        'id', 'name', 'organizationId', 'organizationName', 'level', 'notes', 'createdAt'
      ];

      // Determine the effective organization based on permissions so a caller
      // cannot export teams from organizations they do not belong to.
      const { organizationId: requestedOrgId } = req.query;
      let teams;
      if (currentUser.isSiteAdmin) {
        // Site admins may export a specific org, or all when none is requested.
        teams = await storage.getTeams(requestedOrgId as string | undefined);
      } else {
        const userOrgs = await storage.getUserOrganizations(currentUser.id);
        if (requestedOrgId) {
          const hasAccess = userOrgs.some(uo => uo.organizationId === requestedOrgId);
          if (!hasAccess) {
            return res.status(403).json({
              message: "You do not have access to export teams from this organization"
            });
          }
          teams = await storage.getTeams(requestedOrgId as string);
        } else {
          // Include teams from ALL of the caller's organizations, not just one.
          const orgIds = new Set(userOrgs.map(uo => uo.organizationId));
          if (orgIds.size === 0) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="teams.csv"');
            return res.send(csvHeaders.join(','));
          }
          teams = (await storage.getTeams()).filter(t => t.organizationId && orgIds.has(t.organizationId));
        }
      }

      const csvRows = teams.map(team => {
        return [
          team.id,
          team.name,
          team.organizationId,
          team.organization?.name || '',
          team.level || '',
          team.notes || '',
          team.createdAt
        ].map(field => {
          // Escape commas and quotes for CSV
          const value = String(field || '');
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="teams.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error exporting teams:", error);
      res.status(500).json({ message: "Failed to export teams" });
    }
  });

// Template Wizard endpoint - generates customized templates with team/metric selection
  app.post("/api/import/templates/wizard", uploadLimiter, requireAuth, async (req, res) => {
    try {
      const currentUser = req.session.user;
      if (!currentUser?.id) {
        return res.status(401).json({ message: "User not authenticated" });
      }

      const { type, teamIds, metricCodes, includeExamples } = req.body;

      // Validate type parameter
      if (!type || (type !== 'athletes' && type !== 'measurements')) {
        return res.status(400).json({ message: "Invalid type. Must be 'athletes' or 'measurements'" });
      }

      // Validate teamIds - array check and size limits
      const MAX_TEAM_SELECTION = 50;
      if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({ message: "At least one team is required" });
      }
      if (teamIds.length > MAX_TEAM_SELECTION) {
        return res.status(400).json({ message: `Maximum ${MAX_TEAM_SELECTION} teams allowed` });
      }

      // Validate UUID format for all teamIds
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const invalidTeamIds = teamIds.filter((id: unknown) => typeof id !== 'string' || !uuidRegex.test(id));
      if (invalidTeamIds.length > 0) {
        return res.status(400).json({ message: "Invalid team ID format" });
      }

      // Validate metricCodes if provided
      const MAX_METRIC_SELECTION = 100;
      if (metricCodes !== undefined) {
        if (!Array.isArray(metricCodes)) {
          return res.status(400).json({ message: "metricCodes must be an array" });
        }
        if (metricCodes.length > MAX_METRIC_SELECTION) {
          return res.status(400).json({ message: `Maximum ${MAX_METRIC_SELECTION} metrics allowed` });
        }
        // Validate metric codes are alphanumeric with underscores (max 50 chars)
        const codeRegex = /^[A-Z0-9_]{1,50}$/i;
        const invalidCodes = metricCodes.filter((code: unknown) =>
          typeof code !== 'string' || !codeRegex.test(code)
        );
        if (invalidCodes.length > 0) {
          return res.status(400).json({ message: "Invalid metric code format" });
        }
      }

      // SECURITY: Get user's accessible organizations for multi-tenant filtering
      // Use cached version to reduce redundant DB queries
      const userOrgs = await getCachedUserOrganizations(req, currentUser.id);
      const userOrgIds = new Set(userOrgs.map(uo => uo.organizationId));

      // Get all teams then filter to user's accessible teams
      const allTeams = await storage.getTeams();
      const accessibleTeams = allTeams.filter(t =>
        currentUser.isSiteAdmin || userOrgIds.has(t.organization?.id || '')
      );

      // Filter to selected teams that user can access
      const selectedTeams = accessibleTeams.filter(t => teamIds.includes(t.id));

      // Check if any requested teams exist but user doesn't have access
      const existingTeamIds = allTeams.filter(t => teamIds.includes(t.id)).map(t => t.id);
      const unauthorizedTeamIds = existingTeamIds.filter(id => !selectedTeams.some(t => t.id === id));

      // SECURITY: Return 403 if user is trying to access teams they don't have permission for
      if (unauthorizedTeamIds.length > 0) {
        // SECURITY: Log unauthorized cross-org access attempt
        const attemptedTeamIds = teamIds.filter(id => !selectedTeams.some(t => t.id === id));

        // Log to console for immediate visibility
        console.warn('[SECURITY] Unauthorized cross-org team access attempt:', {
          userId: currentUser.id,
          username: currentUser.username,
          attemptedTeamIds,
          accessibleTeamIds: selectedTeams.map(t => t.id),
          timestamp: new Date().toISOString(),
          ip: req.ip || req.socket.remoteAddress,
          userAgent: req.get('user-agent'),
        });

        // Persist to audit log for security monitoring
        logAuthorizationFailure(currentUser.id, 'generate_template', 'team', {
          attemptedOrgId: attemptedTeamIds.join(','), // Store attempted team IDs as comma-separated string
          userOrgIds: Array.from(userOrgIds),
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.get('user-agent'),
          route: req.path,
          method: req.method,
        });

        return res.status(403).json({ message: "You do not have access to one or more selected teams" });
      }

      // 404 only when teams genuinely don't exist (not an authorization issue)
      if (selectedTeams.length === 0) {
        return res.status(404).json({ message: "No valid teams found in your organizations" });
      }

      // Using COMMON_METRICS imported from @shared/import-types

      if (type === 'athletes') {
        // Generate athlete template
        const headers = [
          'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
          'gender', 'emails', 'phoneNumbers', 'sports', 'position', 'height',
          'weight', 'school', 'teamName'
        ];

        const exampleRows = includeExamples
          ? templateGeneratorService.generateExampleRows('athletes', selectedTeams, [], 3)
          : [];

        const csvContent = templateGeneratorService.buildCsvContent(
          headers,
          exampleRows,
          includeExamples ? 'Example athlete import template' : undefined
        );

        return res.json({
          csvContent,
          headers,
          teams: selectedTeams.map(t => ({ id: t.id, name: t.name })),
          exampleRows,
        });

      } else {
        // Generate measurement template
        // Validate that we have teams with organization context
        if (selectedTeams.length === 0) {
          return res.status(400).json({ message: "No valid teams provided" });
        }

        // Get organization context from first team
        const organizationId = selectedTeams[0]?.organization?.id;
        if (!organizationId) {
          return res.status(400).json({
            message: "Team missing organization context. Please contact support."
          });
        }

        // Get enabled metrics for organization
        let enabledMetrics: any[] = [];

        if (organizationId) {
          try {
            // Try to get organization-specific enabled metrics
            const orgMetrics = await metricService.getOrganizationMetrics(
              organizationId,
              currentUser.id,
              { enabledOnly: true }
            );
            enabledMetrics = orgMetrics.map(om => ({
              code: om.siteMetric.code,
              label: om.siteMetric.label,
              unit: om.siteMetric.unit,
            }));
          } catch (error) {
            console.warn('Could not get organization metrics, falling back to site metrics:', error);
          }
        }

        // Fall back to site metrics if no org metrics
        if (enabledMetrics.length === 0) {
          const siteMetricsData = await storage.getSiteMetrics({ includeInactive: false });
          enabledMetrics = siteMetricsData.map(sm => ({
            code: sm.code,
            label: sm.label,
            unit: sm.unit,
          }));
        }

        // Filter by requested metric codes or use common metrics
        let metricsToUse = enabledMetrics;
        if (metricCodes && Array.isArray(metricCodes) && metricCodes.length > 0) {
          metricsToUse = enabledMetrics.filter(m => metricCodes.includes(m.code));
        } else {
          // Default to common metrics that are enabled
          metricsToUse = enabledMetrics.filter(m => COMMON_METRICS.includes(m.code));
          if (metricsToUse.length === 0) {
            // If no common metrics are enabled, use all enabled metrics
            metricsToUse = enabledMetrics;
          }
        }

        const headers = [
          'firstName', 'lastName', 'teamName', 'date', 'age',
          'metric', 'value', 'units', 'flyInDistance', 'notes', 'gender'
        ];

        const exampleRows = includeExamples && metricsToUse.length > 0
          ? templateGeneratorService.generateExampleRows(
              'measurements',
              selectedTeams,
              metricsToUse.map(m => ({ code: m.code, unit: m.unit })),
              Math.min(6, metricsToUse.length * 2)
            )
          : [];

        const csvContent = templateGeneratorService.buildCsvContent(
          headers,
          exampleRows,
          includeExamples ? 'Example measurement import template' : undefined
        );

        return res.json({
          csvContent,
          headers,
          enabledMetrics: metricsToUse,
          teams: selectedTeams.map(t => ({ id: t.id, name: t.name })),
          exampleRows,
        });
      }
    } catch (error) {
      console.error("Template wizard error:", error);
      const isDevelopment = process.env.NODE_ENV !== 'production';
      res.status(500).json({
        message: "Failed to generate template",
        ...(isDevelopment && {
          error: error instanceof Error ? error.message : String(error)
        })
      });
    }
  });

  // Template download endpoints - provide dynamic CSV templates with valid values
  app.get("/api/import/templates/athletes", requireAuth, async (req, res) => {
    try {
      // Load validation context to get active sports
      const validationContext = await importValidationService.loadValidationContext();

      // Get valid sport codes
      const validSports = importValidationService.getValidSportCodes(validationContext);

      // CSV header row
      const headers = [
        'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
        'gender', 'emails', 'phoneNumbers', 'sports', 'position', 'height', 'weight',
        'school', 'teamName'
      ];

      // Comment line showing valid sports (limit to 30 for readability in Excel/Sheets)
      const maxToShow = 30;
      const displaySports = validSports.slice(0, maxToShow);
      const sportsSuffix = validSports.length > maxToShow
        ? ` ... and ${validSports.length - maxToShow} more`
        : '';
      const commentLine = `# Valid sports: ${displaySports.join(', ')}${sportsSuffix}`;

      // Build CSV content
      const csvContent = `${commentLine}\n${headers.join(',')}`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="athletes-template.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating athletes template:", error);
      res.status(500).json({ message: "Failed to generate athletes template" });
    }
  });

  app.get("/api/import/templates/measurements", requireAuth, async (req, res) => {
    try {
      // Load validation context to get active metrics
      const validationContext = await importValidationService.loadValidationContext();

      // Get valid metrics with units
      const validMetrics = Array.from(validationContext.metrics.values())
        .map(metric => {
          const unit = metric.unit || '';
          return unit ? `${metric.code} (${unit})` : metric.code;
        });

      // CSV header row
      const headers = [
        'firstName', 'lastName', 'teamName', 'date', 'age',
        'metric', 'value', 'units', 'flyInDistance', 'notes', 'gender'
      ];

      // Comment line showing valid metrics with units (limit to 30 for readability)
      const maxToShow = 30;
      const displayMetrics = validMetrics.slice(0, maxToShow);
      const metricsSuffix = validMetrics.length > maxToShow
        ? ` ... and ${validMetrics.length - maxToShow} more`
        : '';
      const commentLine = `# Valid metrics: ${displayMetrics.join(', ')}${metricsSuffix}`;

      // Build CSV content
      const csvContent = `${commentLine}\n${headers.join(',')}`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="measurements-template.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("Error generating measurements template:", error);
      res.status(500).json({ message: "Failed to generate measurements template" });
    }
  });

  console.log("✅ Import/Export routes registered");
}
