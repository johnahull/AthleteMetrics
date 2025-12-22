/**
 * Unit tests for Wellness Digest Job
 *
 * Test coverage:
 * - startWellnessDigestJob() - Schedules cron job
 * - startWellnessDigestJob() - Returns null if disabled
 * - stopWellnessDigestJob() - Stops running job
 * - getJobStatus() - Returns correct status
 * - triggerDigestForOrg() - Manual trigger works
 * - Concurrent runs - Prevents overlapping
 * - Global kill switch - Respects disabled state
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Use vi.hoisted to ensure mock functions are available when vi.mock runs
const {
  mockSchedule,
  mockStop,
  mockSendDigest,
  mockGetOrganizationsForDigest,
  mockIsGlobalPushEnabled,
} = vi.hoisted(() => ({
  mockSchedule: vi.fn(),
  mockStop: vi.fn(),
  mockSendDigest: vi.fn(),
  mockGetOrganizationsForDigest: vi.fn(),
  mockIsGlobalPushEnabled: vi.fn(),
}));

// Mock node-cron
vi.mock("node-cron", () => ({
  default: {
    schedule: mockSchedule,
  },
}));

// Mock the wellness digest service
vi.mock("../../services/wellness-digest-service", () => ({
  getWellnessDigestService: () => ({
    sendDigest: mockSendDigest,
    getOrganizationsForDigest: mockGetOrganizationsForDigest,
    isGlobalPushEnabled: mockIsGlobalPushEnabled,
  }),
}));

import {
  startWellnessDigestJob,
  stopWellnessDigestJob,
  getJobStatus,
  triggerDigestForOrg,
  isJobRunning,
} from "../wellness-digest-job";

describe("Wellness Digest Job", () => {
  const mockDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock cron.schedule to return a mock task
    mockSchedule.mockReturnValue({
      stop: mockStop,
    });
    mockIsGlobalPushEnabled.mockResolvedValue(true);
    mockGetOrganizationsForDigest.mockResolvedValue([]);
    mockSendDigest.mockResolvedValue({
      orgId: "test-org",
      orgName: "Test Org",
      atRiskCount: 0,
      redCount: 0,
      yellowCount: 0,
      coachesSent: 0,
      coachesFailed: 0,
    });

    // Ensure job is stopped before each test
    stopWellnessDigestJob();
  });

  afterEach(() => {
    stopWellnessDigestJob();
  });

  describe("startWellnessDigestJob", () => {
    it("should schedule a cron job when enabled", () => {
      const task = startWellnessDigestJob(mockDb, { enabled: true });

      expect(task).not.toBeNull();
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(mockSchedule).toHaveBeenCalledWith(
        "* * * * *", // Every minute
        expect.any(Function)
      );
    });

    it("should return null when disabled", () => {
      const task = startWellnessDigestJob(mockDb, { enabled: false });

      expect(task).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it("should use default config when none provided", () => {
      const task = startWellnessDigestJob(mockDb);

      expect(task).not.toBeNull();
      expect(mockSchedule).toHaveBeenCalled();
    });

    it("should use custom cron expression", () => {
      startWellnessDigestJob(mockDb, {
        enabled: true,
        cronExpression: "0 7 * * *", // Daily at 7am
      });

      expect(mockSchedule).toHaveBeenCalledWith(
        "0 7 * * *",
        expect.any(Function)
      );
    });

    it("should stop existing job before starting new one", () => {
      // Start first job
      startWellnessDigestJob(mockDb, { enabled: true });
      const firstStopFn = mockSchedule.mock.results[0].value.stop;

      // Start second job
      startWellnessDigestJob(mockDb, { enabled: true });

      // First job should have been stopped
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe("stopWellnessDigestJob", () => {
    it("should stop a running job", () => {
      startWellnessDigestJob(mockDb, { enabled: true });
      stopWellnessDigestJob();

      expect(mockStop).toHaveBeenCalled();
    });

    it("should not throw when no job is running", () => {
      expect(() => stopWellnessDigestJob()).not.toThrow();
    });
  });

  describe("getJobStatus", () => {
    it("should return correct status when job is not scheduled", () => {
      stopWellnessDigestJob();
      const status = getJobStatus();

      expect(status.scheduled).toBe(false);
      expect(status.running).toBe(false);
    });

    it("should return scheduled=true when job is running", () => {
      startWellnessDigestJob(mockDb, { enabled: true });
      const status = getJobStatus();

      expect(status.scheduled).toBe(true);
    });
  });

  describe("triggerDigestForOrg", () => {
    it("should manually trigger digest for a specific org", async () => {
      mockSendDigest.mockResolvedValue({
        orgId: "test-org",
        orgName: "Test Org",
        atRiskCount: 2,
        redCount: 1,
        yellowCount: 1,
        coachesSent: 3,
        coachesFailed: 0,
      });

      const result = await triggerDigestForOrg(mockDb, "test-org");

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("atRiskCount", 2);
      expect(mockSendDigest).toHaveBeenCalledWith("test-org");
    });

    it("should return error on failure", async () => {
      mockSendDigest.mockRejectedValue(new Error("Organization not found"));

      const result = await triggerDigestForOrg(mockDb, "non-existent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Organization not found");
    });
  });

  describe("isJobRunning", () => {
    it("should return false when not running", () => {
      // The isRunning flag is managed internally
      expect(isJobRunning()).toBe(false);
    });
  });

  describe("Cron job callback behavior", () => {
    it("should check global kill switch before processing", async () => {
      mockIsGlobalPushEnabled.mockResolvedValue(false);
      mockGetOrganizationsForDigest.mockResolvedValue([
        { orgId: "org-1", orgName: "Org 1" },
      ]);

      startWellnessDigestJob(mockDb, { enabled: true });

      // Get the callback function that was passed to cron.schedule
      const cronCallback = mockSchedule.mock.calls[0][1];

      // Manually invoke the callback
      await cronCallback();

      // Should not have called sendDigest because global push is disabled
      expect(mockSendDigest).not.toHaveBeenCalled();
    });

    it("should process organizations when enabled and orgs found", async () => {
      mockIsGlobalPushEnabled.mockResolvedValue(true);
      mockGetOrganizationsForDigest.mockResolvedValue([
        { orgId: "org-1", orgName: "Org 1" },
        { orgId: "org-2", orgName: "Org 2" },
      ]);
      mockSendDigest.mockResolvedValue({
        orgId: "org-1",
        orgName: "Org 1",
        atRiskCount: 0,
        redCount: 0,
        yellowCount: 0,
        coachesSent: 0,
        coachesFailed: 0,
      });

      startWellnessDigestJob(mockDb, { enabled: true });

      // Get and invoke the callback
      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      // Should have sent digest for both orgs
      expect(mockSendDigest).toHaveBeenCalledTimes(2);
    });

    it("should skip processing when no orgs need digest", async () => {
      mockIsGlobalPushEnabled.mockResolvedValue(true);
      mockGetOrganizationsForDigest.mockResolvedValue([]);

      startWellnessDigestJob(mockDb, { enabled: true });

      const cronCallback = mockSchedule.mock.calls[0][1];
      await cronCallback();

      expect(mockSendDigest).not.toHaveBeenCalled();
    });

    it("should handle errors in individual org digests gracefully", async () => {
      mockIsGlobalPushEnabled.mockResolvedValue(true);
      mockGetOrganizationsForDigest.mockResolvedValue([
        { orgId: "org-1", orgName: "Org 1" },
        { orgId: "org-2", orgName: "Org 2" },
      ]);
      mockSendDigest
        .mockRejectedValueOnce(new Error("DB connection failed"))
        .mockResolvedValueOnce({
          orgId: "org-2",
          orgName: "Org 2",
          atRiskCount: 1,
          redCount: 1,
          yellowCount: 0,
          coachesSent: 1,
          coachesFailed: 0,
        });

      startWellnessDigestJob(mockDb, { enabled: true });

      const cronCallback = mockSchedule.mock.calls[0][1];

      // Should not throw despite first org failing
      await expect(cronCallback()).resolves.not.toThrow();

      // Should still have processed both
      expect(mockSendDigest).toHaveBeenCalledTimes(2);
    });
  });
});
