/**
 * Types for import functionality with manual review capabilities
 */

/**
 * Import modes for athlete imports
 */
export type AthleteImportMode =
  | 'smart_import'      // Auto-create if not found, update if found (default, most user-friendly)
  | 'create_only'       // Always create new records, never match
  | 'match_and_update'  // Only import for existing athletes, update their info
  | 'match_only';       // Match existing athletes without updating info

/**
 * Import modes for measurement imports
 */
export type MeasurementImportMode =
  | 'match_only'            // Require existing athletes (default)
  | 'create_athletes'       // Auto-create athlete records if needed
  | 'review_all'            // Send all to manual review queue
  | 'review_low_confidence';// Only review matches below 75% confidence

/**
 * Team handling strategies
 */
export type TeamHandlingMode =
  | 'auto_create_confirm'   // Show confirmation dialog for missing teams (default)
  | 'auto_create_silent'    // Automatically create missing teams
  | 'require_existing'      // Fail if teams don't exist
  | 'leave_teamless';       // Create athletes without team assignment

/**
 * Validation strictness levels
 */
export type ValidationLevel =
  | 'strict'      // Fail on any validation error
  | 'standard'    // Warnings for minor issues, errors for critical ones (default)
  | 'lenient';    // Skip invalid rows, continue with valid ones

/**
 * Comprehensive import options
 */
export interface ImportOptions {
  // Core import mode
  athleteMode?: AthleteImportMode;
  measurementMode?: MeasurementImportMode;

  // Team handling
  teamHandling?: TeamHandlingMode;
  organizationId?: string;

  // Additional options
  updateExisting?: boolean;         // Update athlete info when matching
  skipDuplicates?: boolean;         // Skip duplicate records
  validationLevel?: ValidationLevel;
  defaultTeamId?: string;           // Fallback team for athletes

  // Column mappings (if using custom mapping)
  columnMappings?: Record<string, string>;
}

export interface ImportReviewItem {
  id: string;
  type: 'measurement' | 'athlete';
  status: 'pending' | 'approved' | 'rejected';
  originalData: Record<string, any>;
  matchingCriteria: {
    firstName: string;
    lastName: string;
    email?: string;
    birthYear?: number;
    teamName?: string;
    gender?: string;
  };
  suggestedMatch?: {
    id: string;
    firstName: string;
    lastName: string;
    confidence: number;
    reason: string;
  };
  alternatives?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    confidence: number;
    reason: string;
  }>;
  createdAt: Date;
  createdBy: string;
  reviewedAt?: Date;
  reviewedBy?: string;
  reviewNotes?: string;
}

export interface ImportReviewQueue {
  items: ImportReviewItem[];
  totalCount: number;
  pendingCount: number;
}

export interface ImportReviewDecision {
  itemId: string;
  action: 'approve' | 'reject' | 'select_alternative';
  selectedAthleteId?: string; // For select_alternative action
  notes?: string;
}

export interface TeamPreview {
  teamName: string;
  exists: boolean;
  teamId?: string;
  athleteCount: number;
  athleteNames: string[];
}

export interface ImportPreview {
  type: 'athletes' | 'measurements';
  totalRows: number;
  missingTeams: TeamPreview[];
  missingAthletes?: number;        // Count of athletes that will be created
  existingAthletes?: number;       // Count of athletes that will be matched
  previewData: any[];
  requiresConfirmation: boolean;
  options?: ImportOptions;         // Options used for this preview
}

export interface ImportConfirmation {
  createMissingTeams: boolean;
  organizationId?: string;
  teamMappings?: Record<string, string>; // CSV team name -> existing team ID
  previewData: any[];
  options?: ImportOptions;         // Import options to use
}

export interface ColumnMapping {
  csvColumn: string;
  systemField: string;
  isRequired: boolean;
  autoDetected: boolean;
}

export interface CSVParseResult {
  headers: string[];
  rows: any[];
  suggestedMappings: ColumnMapping[];
}

export interface ValidationResult {
  rowIndex: number;
  field: string;
  status: 'valid' | 'warning' | 'error';
  message?: string;
}

export interface PreviewRow {
  rowIndex: number;
  data: Record<string, any>;
  validations: ValidationResult[];
  matchStatus?: 'will_create' | 'will_match' | 'duplicate' | 'error';
  matchedAthleteId?: string;
  matchedAthleteName?: string;
}

export interface ImportResult {
  type: 'athletes' | 'measurements';
  totalRows: number;
  results: Array<{
    action: 'created' | 'matched' | 'updated' | 'matched_and_deactivated' | 'pending_review' | 'skipped';
    athlete?: {
      id: string;
      name: string;
      username?: string;
      note?: string;
    };
    measurement?: {
      id: string;
      athlete: string;
      metric: string;
      value: number;
      date: string;
    };
    reviewItem?: {
      id: string;
      reason: string;
    };
  }>;
  errors: Array<{
    row: number;
    error: string;
  }>;
  warnings: string[];
  summary: {
    successful: number;
    created: number;
    updated: number;
    matched: number;
    failed: number;
    warnings: number;
    skipped: number;
    pendingReview: number;
  };
  createdTeams?: Array<{
    id: string;
    name: string;
    athleteCount: number;
  }>;
  createdAthletes?: Array<{
    id: string;
    name: string;
  }>;
  options?: ImportOptions;  // Options used for this import
}

/**
 * Mode descriptions for UI display
 */
export const ATHLETE_MODE_DESCRIPTIONS: Record<AthleteImportMode, { label: string; description: string }> = {
  smart_import: {
    label: 'Smart Import (Recommended)',
    description: 'Automatically create new athletes if not found, update existing athletes with new data'
  },
  create_only: {
    label: 'Create Only',
    description: 'Always create new athlete records, never match or update existing athletes'
  },
  match_and_update: {
    label: 'Match & Update',
    description: 'Only import for existing athletes and update their information from CSV'
  },
  match_only: {
    label: 'Match Only',
    description: 'Match existing athletes without updating any information'
  }
};

export const MEASUREMENT_MODE_DESCRIPTIONS: Record<MeasurementImportMode, { label: string; description: string }> = {
  match_only: {
    label: 'Match Only (Default)',
    description: 'Only import measurements for existing athletes, skip rows for unknown athletes'
  },
  create_athletes: {
    label: 'Create Athletes if Needed',
    description: 'Automatically create athlete records when not found (useful for historical data)'
  },
  review_all: {
    label: 'Review All Matches',
    description: 'Send all athlete matches to manual review queue for verification'
  },
  review_low_confidence: {
    label: 'Review Low Confidence',
    description: 'Auto-approve high confidence matches (&gt;75%), review ambiguous matches'
  }
};

export const TEAM_HANDLING_DESCRIPTIONS: Record<TeamHandlingMode, { label: string; description: string }> = {
  auto_create_confirm: {
    label: 'Confirm Team Creation',
    description: 'Show confirmation dialog listing all missing teams before creating'
  },
  auto_create_silent: {
    label: 'Auto-create Teams',
    description: 'Automatically create any missing teams without asking'
  },
  require_existing: {
    label: 'Require Existing Teams',
    description: 'Fail import for rows with teams that don\'t exist'
  },
  leave_teamless: {
    label: 'Leave Teamless',
    description: 'Create athletes without team assignment for missing teams'
  }
};