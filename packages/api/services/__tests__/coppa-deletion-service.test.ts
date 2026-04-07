/**
 * Unit tests — CoppaDeletionService (service-layer isolation)
 *
 * Test coverage:
 * - getDeletionRequest: returns null for an unknown UUID
 * - getDeletionRequest: returns the request object for a known ID
 * - processDeletion: race-condition guard — already-completed request is rejected
 *
 * The database (db) is mocked so no real PostgreSQL connection is required.
 * The EmailService is mocked to prevent real emails.
 * The storage singleton is mocked to satisfy BaseService.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockDbSelect, mockDbUpdate, mockDbInsert, mockDbTransaction, mockGetUser } =
  vi.hoisted(() => {
    const mockDbSelect = vi.fn();
    const mockDbUpdate = vi.fn();
    const mockDbInsert = vi.fn();
    const mockDbTransaction = vi.fn();
    const mockGetUser = vi.fn();
    return { mockDbSelect, mockDbUpdate, mockDbInsert, mockDbTransaction, mockGetUser };
  });

// Mock the database module
vi.mock('../../db', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
    transaction: mockDbTransaction,
  },
}));

// Mock the storage singleton used by BaseService
vi.mock('../../storage', () => ({
  storage: {
    getUser: mockGetUser,
  },
}));

// Mock the EmailService constructor so the service doesn't send real emails.
// Must use vi.hoisted so the variables are available when vi.mock() runs.
const { mockSendDeletionRequestConfirmation, mockSendDeletionCompletedNotification } =
  vi.hoisted(() => ({
    mockSendDeletionRequestConfirmation: vi.fn().mockResolvedValue(true),
    mockSendDeletionCompletedNotification: vi.fn().mockResolvedValue(true),
  }));

vi.mock('../email-service', () => ({
  EmailService: vi.fn().mockImplementation(() => ({
    sendDeletionRequestConfirmation: mockSendDeletionRequestConfirmation,
    sendDeletionCompletedNotification: mockSendDeletionCompletedNotification,
  })),
  emailService: {
    sendDeletionRequestConfirmation: mockSendDeletionRequestConfirmation,
    sendDeletionCompletedNotification: mockSendDeletionCompletedNotification,
  },
}));

import { CoppaDeletionService } from '../coppa-deletion-service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PENDING_REQUEST = {
  id: 'req-uuid-pending',
  athleteUserId: 'athlete-uuid-1',
  requestedByEmail: 'parent@example.com',
  consentId: null,
  status: 'pending',
  requestedAt: new Date('2026-03-01T12:00:00Z'),
  processedAt: null,
  processedBy: null,
  notes: null,
};

const COMPLETED_REQUEST = {
  ...PENDING_REQUEST,
  id: 'req-uuid-completed',
  status: 'completed',
  processedAt: new Date('2026-03-02T08:00:00Z'),
  processedBy: 'admin-uuid',
};

const PROCESSING_REQUEST = {
  ...PENDING_REQUEST,
  id: 'req-uuid-processing',
  status: 'processing',
};

// ---------------------------------------------------------------------------
// Helper: build a chainable db.select() mock returning the given rows
// ---------------------------------------------------------------------------

function stubSelectReturning(rows: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoppaDeletionService', () => {
  let service: CoppaDeletionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CoppaDeletionService();
  });

  // -------------------------------------------------------------------------
  // getDeletionRequest
  // -------------------------------------------------------------------------

  describe('getDeletionRequest', () => {
    it('returns null when no record exists for the given UUID', async () => {
      stubSelectReturning([]); // empty result set

      const result = await service.getDeletionRequest('non-existent-uuid');

      expect(result).toBeNull();
    });

    it('returns the request object when a matching record exists', async () => {
      stubSelectReturning([PENDING_REQUEST]);

      const result = await service.getDeletionRequest(PENDING_REQUEST.id);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(PENDING_REQUEST.id);
      expect(result!.status).toBe('pending');
      expect(result!.athleteUserId).toBe(PENDING_REQUEST.athleteUserId);
    });

    it('returns the first row when multiple rows are returned (limit 1 semantics)', async () => {
      // Stub returns two rows to verify the service destructures only the first
      stubSelectReturning([PENDING_REQUEST, COMPLETED_REQUEST]);

      const result = await service.getDeletionRequest(PENDING_REQUEST.id);

      expect(result).toMatchObject({ id: PENDING_REQUEST.id });
      expect(result!.status).toBe('pending'); // not 'completed' from the second row
    });
  });

  // -------------------------------------------------------------------------
  // processDeletion — race-condition / status guard
  // -------------------------------------------------------------------------

  describe('processDeletion — status guard', () => {
    it('returns a 409 error when the request status is already "completed"', async () => {
      // getDeletionRequest will be called first — stub it to return the completed record
      stubSelectReturning([COMPLETED_REQUEST]);

      const result = await service.processDeletion(
        COMPLETED_REQUEST.id,
        'admin-uuid',
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.error).toMatch(/completed/i);

      // The transaction (cascade delete) must NOT have been executed
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it('returns a 409 error when the request status is already "processing"', async () => {
      stubSelectReturning([PROCESSING_REQUEST]);

      const result = await service.processDeletion(
        PROCESSING_REQUEST.id,
        'admin-uuid',
      );

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(409);
      expect(result.error).toMatch(/processing/i);
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it('returns a 404 error when the request does not exist', async () => {
      stubSelectReturning([]); // no record found

      const result = await service.processDeletion('ghost-uuid', 'admin-uuid');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });
});
