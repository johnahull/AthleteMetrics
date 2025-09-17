/**
 * Types for import functionality with manual review capabilities
 */

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

export interface ImportResult {
  type: 'athletes' | 'measurements';
  totalRows: number;
  results: Array<{
    action: 'created' | 'matched' | 'matched_and_deactivated' | 'pending_review';
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
    failed: number;
    warnings: number;
    pendingReview: number;
  };
}