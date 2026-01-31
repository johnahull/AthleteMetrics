/**
 * Unit tests for wellness-scheduled-job.ts
 *
 * Follows wellness-digest-job.test.ts pattern:
 * vi.hoisted() for mock fns, vi.mock() for dependencies.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  mockSchedule,
  mockStop,
  mockGetDueScheduledRequests,
  mockActivateScheduledRequest,
  mockGetSchedulesDueNow,
  mockUpdateScheduleAfterRun,
  mockSendWellnessRequestNotifications,
  mockCreateWellnessRequest,
  mockGenerateMagicLinkToken,
  mockComputeNextRunAt,
} = vi.hoisted(() => ({
  mockSchedule: vi.fn(),
  mockStop: vi.fn(),
  mockGetDueScheduledRequests: vi.fn(),
  mockActivateScheduledRequest: vi.fn(),
  mockGetSchedulesDueNow: vi.fn(),
  mockUpdateScheduleAfterRun: vi.fn(),
  mockSendWellnessRequestNotifications: vi.fn(),
  mockCreateWellnessRequest: vi.fn(),
  mockGenerateMagicLinkToken: vi.fn(),
  mockComputeNextRunAt: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: mockSchedule },
}));

vi.mock('../../repositories/wellness-repository', () => ({
  wellnessRepository: {
    getDueScheduledRequests: mockGetDueScheduledRequests,
    activateScheduledRequest: mockActivateScheduledRequest,
    getSchedulesDueNow: mockGetSchedulesDueNow,
    updateScheduleAfterRun: mockUpdateScheduleAfterRun,
  },
}));

vi.mock('../../services/wellness-notification-service', () => ({
  sendWellnessRequestNotifications: mockSendWellnessRequestNotifications,
}));

vi.mock('../../storage', () => ({
  storage: {
    createWellnessRequest: mockCreateWellnessRequest,
  },
}));

vi.mock('../../auth/wellness-access', () => ({
  WellnessAccessService: {
    generateMagicLinkToken: mockGenerateMagicLinkToken,
  },
}));

vi.mock('../../lib/wellness-schedule-utils', () => ({
  computeNextRunAt: mockComputeNextRunAt,
}));

import {
  startWellnessScheduledJob,
  stopWellnessScheduledJob,
  isScheduledJobRunning,
  __resetJobStateForTesting,
} from '../wellness-scheduled-job';

describe('Wellness Scheduled Job', () => {
  const mockDb = {
    execute: vi.fn().mockResolvedValue([{ exists: true }]),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSchedule.mockReturnValue({ stop: mockStop });
    mockGetDueScheduledRequests.mockResolvedValue([]);
    mockGetSchedulesDueNow.mockResolvedValue([]);
    mockSendWellnessRequestNotifications.mockResolvedValue({});
    mockGenerateMagicLinkToken.mockReturnValue('mock-token');
    stopWellnessScheduledJob();
    __resetJobStateForTesting(); // Reset job state between tests
  });

  afterEach(() => {
    stopWellnessScheduledJob();
  });

  describe('startWellnessScheduledJob', () => {
    it('should schedule a cron job', () => {
      const task = startWellnessScheduledJob(mockDb);
      expect(task).not.toBeNull();
      expect(mockSchedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));
    });

    it('should stop existing job before starting new one', () => {
      startWellnessScheduledJob(mockDb);
      startWellnessScheduledJob(mockDb);
      expect(mockStop).toHaveBeenCalled();
    });

    it('should return the scheduled task', () => {
      const task = startWellnessScheduledJob(mockDb);
      expect(task).toHaveProperty('stop');
    });
  });

  describe('stopWellnessScheduledJob', () => {
    it('should stop a running job', () => {
      startWellnessScheduledJob(mockDb);
      stopWellnessScheduledJob();
      expect(mockStop).toHaveBeenCalled();
    });

    it('should not throw when no job is running', () => {
      expect(() => stopWellnessScheduledJob()).not.toThrow();
    });
  });

  describe('Phase 1 — one-time scheduled requests', () => {
    it('should activate due requests and send notifications', async () => {
      const mockRequest = {
        id: 'req-1',
        templateId: 'tmpl-1',
        distributionMethod: 'magic_link',
        targetAthleteIds: ['a-1'],
        targetTeamIds: null,
        expiresAt: new Date(),
        requestedBy: 'user-1',
        organizationId: 'org-1',
      };
      const activated = { ...mockRequest, status: 'active' };

      mockGetDueScheduledRequests.mockResolvedValue([mockRequest]);
      mockActivateScheduledRequest.mockResolvedValue(activated);

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockActivateScheduledRequest).toHaveBeenCalledWith('req-1');
      expect(mockSendWellnessRequestNotifications).toHaveBeenCalledWith(
        activated,
        expect.objectContaining({ templateId: 'tmpl-1' }),
        'user-1',
        'org-1'
      );
    });

    it('should skip when no due requests', async () => {
      mockGetDueScheduledRequests.mockResolvedValue([]);

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockActivateScheduledRequest).not.toHaveBeenCalled();
    });

    it('should handle individual failure gracefully', async () => {
      const req1 = { id: 'r1', templateId: 't1', distributionMethod: 'magic_link', requestedBy: 'u1', organizationId: 'o1', targetAthleteIds: null, targetTeamIds: null, expiresAt: null };
      const req2 = { id: 'r2', templateId: 't2', distributionMethod: 'magic_link', requestedBy: 'u2', organizationId: 'o2', targetAthleteIds: null, targetTeamIds: null, expiresAt: null };

      mockGetDueScheduledRequests.mockResolvedValue([req1, req2]);
      mockActivateScheduledRequest
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ ...req2, status: 'active' });

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await expect(cronCallback()).resolves.not.toThrow();
      expect(mockActivateScheduledRequest).toHaveBeenCalledTimes(2);
    });

    it('should skip notification when requestedBy is null', async () => {
      const req = { id: 'r1', templateId: 't1', distributionMethod: 'magic_link', requestedBy: null, organizationId: 'o1', targetAthleteIds: null, targetTeamIds: null, expiresAt: null };
      mockGetDueScheduledRequests.mockResolvedValue([req]);
      mockActivateScheduledRequest.mockResolvedValue({ ...req, status: 'active' });

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockActivateScheduledRequest).toHaveBeenCalled();
      expect(mockSendWellnessRequestNotifications).not.toHaveBeenCalled();
    });
  });

  describe('Phase 2 — recurring schedules', () => {
    const mockScheduleRecord = {
      id: 'sched-1',
      organizationId: 'org-1',
      templateId: 'tmpl-1',
      createdBy: 'user-1',
      distributionMethod: 'athlete_account',
      targetAthleteIds: ['a-1'],
      targetTeamIds: null,
      requiresAuth: false,
      recurrenceType: 'daily',
      daysOfWeek: null,
      customIntervalDays: null,
      scheduledTime: '09:00',
      timezone: 'UTC',
      endDate: null,
      maxOccurrences: 10,
      occurrencesSent: 2,
    };

    it('should create a request from schedule and send notifications', async () => {
      const createdRequest = { id: 'new-req', publicToken: 'tok' };
      mockGetSchedulesDueNow.mockResolvedValue([mockScheduleRecord]);
      mockCreateWellnessRequest.mockResolvedValue(createdRequest);
      mockComputeNextRunAt.mockReturnValue(new Date('2025-06-16T09:00:00Z'));

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockCreateWellnessRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-1',
          templateId: 'tmpl-1',
          status: 'active',
        })
      );
      expect(mockSendWellnessRequestNotifications).toHaveBeenCalled();
    });

    it('should increment occurrences and update nextRunAt', async () => {
      const nextRun = new Date('2025-06-16T09:00:00Z');
      mockGetSchedulesDueNow.mockResolvedValue([mockScheduleRecord]);
      mockCreateWellnessRequest.mockResolvedValue({ id: 'r', publicToken: 't' });
      mockComputeNextRunAt.mockReturnValue(nextRun);

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockUpdateScheduleAfterRun).toHaveBeenCalledWith('sched-1', nextRun, 3);
    });

    it('should mark completed when nextRunAt is null', async () => {
      mockGetSchedulesDueNow.mockResolvedValue([mockScheduleRecord]);
      mockCreateWellnessRequest.mockResolvedValue({ id: 'r', publicToken: 't' });
      mockComputeNextRunAt.mockReturnValue(null);

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockUpdateScheduleAfterRun).toHaveBeenCalledWith('sched-1', null, 3);
    });

    it('should set 24h expiresAt on created request', async () => {
      mockGetSchedulesDueNow.mockResolvedValue([mockScheduleRecord]);
      mockCreateWellnessRequest.mockResolvedValue({ id: 'r', publicToken: 't' });
      mockComputeNextRunAt.mockReturnValue(new Date());

      const before = Date.now();
      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      const callArgs = mockCreateWellnessRequest.mock.calls[0][0];
      const expiresAt = callArgs.expiresAt as Date;
      const diff = expiresAt.getTime() - before;
      // Should be approximately 24 hours (within 5 seconds tolerance)
      expect(diff).toBeGreaterThan(24 * 60 * 60 * 1000 - 5000);
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 5000);
    });

    it('should skip when no schedules are due', async () => {
      mockGetSchedulesDueNow.mockResolvedValue([]);

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockCreateWellnessRequest).not.toHaveBeenCalled();
    });

    it('should NOT advance schedule on individual failure', async () => {
      mockGetSchedulesDueNow.mockResolvedValue([mockScheduleRecord]);
      mockCreateWellnessRequest.mockRejectedValue(new Error('DB fail'));

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];
      await expect(cronCallback()).resolves.not.toThrow();

      expect(mockUpdateScheduleAfterRun).not.toHaveBeenCalled();
    });
  });

  describe('isRunning guard', () => {
    it('should return false when not running', () => {
      expect(isScheduledJobRunning()).toBe(false);
    });

    it('should prevent concurrent execution', async () => {
      // Make Phase 1 hang so we can observe isRunning mid-execution
      let resolvePhase1!: () => void;
      const phase1Promise = new Promise<void>(r => { resolvePhase1 = r; });
      mockGetDueScheduledRequests.mockReturnValue(phase1Promise.then(() => []));

      startWellnessScheduledJob(mockDb);
      const cronCallback = mockSchedule.mock.calls[0][1];

      // Start first execution (will hang on Phase 1)
      const firstRun = cronCallback();
      expect(isScheduledJobRunning()).toBe(true);

      // Second invocation should return immediately (isRunning guard)
      await cronCallback();
      // Phase 1 was only entered once (the second call bailed out)
      expect(mockGetDueScheduledRequests).toHaveBeenCalledTimes(1);

      // Let first run complete
      resolvePhase1();
      await firstRun;
      expect(isScheduledJobRunning()).toBe(false);
    });
  });
});
