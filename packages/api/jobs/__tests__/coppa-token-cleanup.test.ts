/**
 * Unit tests for COPPA Token Cleanup Job lifecycle
 *
 * Test coverage:
 * - startCoppaTokenCleanupJob() - Registers a cron task
 * - startCoppaTokenCleanupJob() - Guard against duplicate registration
 * - stopCoppaTokenCleanupJob() - Stops the task and nulls the ref
 * - stopCoppaTokenCleanupJob() - No-op when no job is running
 *
 * node-cron and all database/service dependencies are mocked so these
 * tests run without a database connection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories — must exist before vi.mock() calls are executed
// ---------------------------------------------------------------------------

const { mockSchedule, mockStop, mockWriteCoppaAudit } = vi.hoisted(() => ({
  mockSchedule: vi.fn(),
  mockStop: vi.fn(),
  mockWriteCoppaAudit: vi.fn().mockResolvedValue(undefined),
}));

// Mock node-cron so no real timers are registered
vi.mock('node-cron', () => ({
  default: {
    schedule: mockSchedule,
  },
}));

// Mock the database to prevent Neon/PG connection attempts
vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

// Mock coppa-service so cleanupExpiredTokens() won't hit the DB if invoked
vi.mock('../../services/coppa-service', () => ({
  coppaService: {
    writeCoppaAudit: mockWriteCoppaAudit,
  },
}));

// Import subject under test AFTER mocks are set up
import {
  startCoppaTokenCleanupJob,
  stopCoppaTokenCleanupJob,
} from '../coppa-token-cleanup';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('COPPA Token Cleanup Job lifecycle', () => {
  // Provide a stable mock task object that cron.schedule will return
  const mockTask = { stop: mockStop };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSchedule.mockReturnValue(mockTask);

    // Always ensure the module-level ref is null before each test so tests
    // are independent. Calling stop() is safe when nothing is running.
    stopCoppaTokenCleanupJob();
  });

  afterEach(() => {
    // Belt-and-suspenders cleanup
    stopCoppaTokenCleanupJob();
  });

  // -------------------------------------------------------------------------
  // startCoppaTokenCleanupJob
  // -------------------------------------------------------------------------

  describe('startCoppaTokenCleanupJob', () => {
    it('registers exactly one cron task', () => {
      startCoppaTokenCleanupJob();

      expect(mockSchedule).toHaveBeenCalledTimes(1);
    });

    it('schedules the job with the daily 03:00 UTC cron expression', () => {
      startCoppaTokenCleanupJob();

      expect(mockSchedule).toHaveBeenCalledWith(
        '0 3 * * *',
        expect.any(Function),
        expect.objectContaining({ timezone: 'UTC' }),
      );
    });

    it('does NOT register a second task when called twice (guard check)', () => {
      startCoppaTokenCleanupJob();
      startCoppaTokenCleanupJob(); // duplicate call

      // cron.schedule must have been called only on the first invocation
      expect(mockSchedule).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // stopCoppaTokenCleanupJob
  // -------------------------------------------------------------------------

  describe('stopCoppaTokenCleanupJob', () => {
    it('calls stop() on the scheduled task when a job is running', () => {
      startCoppaTokenCleanupJob();
      stopCoppaTokenCleanupJob();

      expect(mockStop).toHaveBeenCalledTimes(1);
    });

    it('allows a new job to be registered after stopping the previous one', () => {
      startCoppaTokenCleanupJob();
      stopCoppaTokenCleanupJob();

      // After stop, the internal ref is null — a fresh start should work
      startCoppaTokenCleanupJob();

      expect(mockSchedule).toHaveBeenCalledTimes(2);
    });

    it('is a no-op and does not throw when no job is running', () => {
      // No start() call — ref is already null
      expect(() => stopCoppaTokenCleanupJob()).not.toThrow();
      expect(mockStop).not.toHaveBeenCalled();
    });

    it('calling stop() twice is a no-op on the second call', () => {
      startCoppaTokenCleanupJob();
      stopCoppaTokenCleanupJob();
      stopCoppaTokenCleanupJob(); // second stop with no job running

      // stop() on the task should only have been called once
      expect(mockStop).toHaveBeenCalledTimes(1);
    });
  });
});
