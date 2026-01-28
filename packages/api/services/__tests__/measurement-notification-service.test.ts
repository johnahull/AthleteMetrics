/**
 * Measurement Notification Service Tests
 * TDD: Tests for notifying athletes when coaches record measurements
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPushSendToUser, mockEmailSendNewMeasurement, createMockDb } = vi.hoisted(() => {
  const mockPushSendToUser = vi.fn();
  const mockEmailSendNewMeasurement = vi.fn();
  const createMockDb = () => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  });
  return { mockPushSendToUser, mockEmailSendNewMeasurement, createMockDb };
});

let mockDb = createMockDb();

vi.mock('../push-notification-service', () => ({
  getPushNotificationService: () => ({
    sendToUser: mockPushSendToUser,
  }),
}));

vi.mock('../email-service', () => ({
  emailService: {
    sendNewMeasurementNotification: mockEmailSendNewMeasurement,
  },
}));

vi.mock('../../db', () => ({
  get db() {
    return mockDb;
  },
}));

import { notifyNewMeasurement } from '../measurement-notification-service';

describe('Measurement Notification Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createMockDb();
  });

  describe('skip conditions', () => {
    it('should skip when athlete submitted their own measurement (self-entry)', async () => {
      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'athlete-1', // same as userId
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockPushSendToUser).not.toHaveBeenCalled();
      expect(mockEmailSendNewMeasurement).not.toHaveBeenCalled();
    });

    it('should skip when no organizationId (personal measurement)', async () => {
      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: null,
        date: '2025-01-15',
      });

      expect(mockPushSendToUser).not.toHaveBeenCalled();
      expect(mockEmailSendNewMeasurement).not.toHaveBeenCalled();
    });

    it('should skip when athlete user not found in DB', async () => {
      // Promise.all returns: [athlete (empty), submitter, metric, prefs]
      // But since athlete is empty, we return early before using the others
      // Mock all 4 where calls since Promise.all fires them all
      mockDb.where.mockResolvedValueOnce([]); // athlete - not found
      mockDb.where.mockResolvedValueOnce([{ id: 'coach-1', fullName: 'Coach' }]);
      mockDb.where.mockResolvedValueOnce([{ label: 'Fly' }]);
      mockDb.where.mockResolvedValueOnce([{ emailNewMeasurements: false }]);

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'nonexistent-user',
        submittedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockPushSendToUser).not.toHaveBeenCalled();
      expect(mockEmailSendNewMeasurement).not.toHaveBeenCalled();
    });
  });

  describe('parallel query failure', () => {
    it('should catch and log when a DB query in Promise.all rejects', async () => {
      // Simulate one of the parallel queries failing
      mockDb.where.mockResolvedValueOnce([{
        id: 'athlete-1', firstName: 'John', lastName: 'Doe', emails: ['john@test.com'],
      }]);
      mockDb.where.mockRejectedValueOnce(new Error('DB connection lost'));
      mockDb.where.mockResolvedValueOnce([{ label: '10-Yard Fly' }]);
      mockDb.where.mockResolvedValueOnce([{ emailNewMeasurements: false }]);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw — outer try-catch handles Promise.all rejection
      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to process measurement notification:',
        expect.any(Error)
      );
      expect(mockPushSendToUser).not.toHaveBeenCalled();
      expect(mockEmailSendNewMeasurement).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('submitter fallback', () => {
    it('should use "A coach" when submitter not found in DB', async () => {
      mockDb.where.mockResolvedValueOnce([{
        id: 'athlete-1', firstName: 'John', lastName: 'Doe', emails: ['john@test.com'],
      }]);
      // submitter not found
      mockDb.where.mockResolvedValueOnce([]);
      mockDb.where.mockResolvedValueOnce([{ label: '10-Yard Fly' }]);
      mockDb.where.mockResolvedValueOnce([{ emailNewMeasurements: false }]);

      mockPushSendToUser.mockResolvedValue({ successful: 1, failed: 0 });

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'deleted-coach',
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockPushSendToUser).toHaveBeenCalledWith(
        'athlete-1',
        expect.objectContaining({
          body: 'A coach recorded your 10-Yard Fly: 1.25 s',
        }),
        'org-1'
      );
    });
  });

  describe('missing athlete email', () => {
    it('should skip email when athlete has empty emails array', async () => {
      mockDb.where.mockResolvedValueOnce([{
        id: 'athlete-1', firstName: 'John', lastName: 'Doe', emails: [],
      }]);
      mockDb.where.mockResolvedValueOnce([{
        id: 'coach-1', fullName: 'Coach Smith',
      }]);
      mockDb.where.mockResolvedValueOnce([{ label: 'Vertical Jump' }]);
      mockDb.where.mockResolvedValueOnce([{ emailNewMeasurements: true }]);

      mockPushSendToUser.mockResolvedValue({ successful: 1, failed: 0 });

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'VERTICAL_JUMP',
        value: '32.5',
        units: 'in',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      // Push should still be sent
      expect(mockPushSendToUser).toHaveBeenCalled();
      // Email should be skipped despite opt-in
      expect(mockEmailSendNewMeasurement).not.toHaveBeenCalled();
    });

    it('should skip email when athlete emails is null', async () => {
      mockDb.where.mockResolvedValueOnce([{
        id: 'athlete-1', firstName: 'John', lastName: 'Doe', emails: null,
      }]);
      mockDb.where.mockResolvedValueOnce([{
        id: 'coach-1', fullName: 'Coach Smith',
      }]);
      mockDb.where.mockResolvedValueOnce([{ label: 'Vertical Jump' }]);
      mockDb.where.mockResolvedValueOnce([{ emailNewMeasurements: true }]);

      mockPushSendToUser.mockResolvedValue({ successful: 1, failed: 0 });

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'VERTICAL_JUMP',
        value: '32.5',
        units: 'in',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockPushSendToUser).toHaveBeenCalled();
      expect(mockEmailSendNewMeasurement).not.toHaveBeenCalled();
    });
  });

  describe('push notification', () => {
    const setupMocks = (overrides?: {
      athlete?: any;
      submitter?: any;
      metricConfig?: any;
      prefs?: any;
    }) => {
      const athlete = overrides?.athlete ?? {
        id: 'athlete-1',
        firstName: 'John',
        lastName: 'Doe',
        emails: ['john@test.com'],
      };
      const submitter = overrides?.submitter ?? {
        id: 'coach-1',
        firstName: 'Coach',
        lastName: 'Smith',
        fullName: 'Coach Smith',
      };
      const metricConfig = overrides?.metricConfig ?? {
        code: 'FLY10_TIME',
        label: '10-Yard Fly',
        unit: 's',
      };
      const prefs = overrides?.prefs ?? {
        emailNewMeasurements: false,
      };

      // 1st where: athlete user lookup
      mockDb.where.mockResolvedValueOnce([athlete]);
      // 2nd where: submitter user lookup
      mockDb.where.mockResolvedValueOnce([submitter]);
      // 3rd where: siteMetrics lookup
      mockDb.where.mockResolvedValueOnce([metricConfig]);
      // 4th where: notification preferences
      mockDb.where.mockResolvedValueOnce([prefs]);

      mockPushSendToUser.mockResolvedValue({ successful: 1, failed: 0 });
      mockEmailSendNewMeasurement.mockResolvedValue(true);

      return { athlete, submitter, metricConfig };
    };

    it('should send push with correct payload', async () => {
      setupMocks();

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockPushSendToUser).toHaveBeenCalledWith(
        'athlete-1',
        expect.objectContaining({
          title: 'New Measurement Recorded',
          body: 'Coach Smith recorded your 10-Yard Fly: 1.25 s',
          type: 'new_measurement',
          url: '/my-measurements',
        }),
        'org-1'
      );
    });

    it('should use metric code as fallback when siteMetrics not found', async () => {
      // athlete
      mockDb.where.mockResolvedValueOnce([{
        id: 'athlete-1', firstName: 'John', lastName: 'Doe', emails: ['john@test.com'],
      }]);
      // submitter
      mockDb.where.mockResolvedValueOnce([{
        id: 'coach-1', firstName: 'Coach', lastName: 'Smith', fullName: 'Coach Smith',
      }]);
      // siteMetrics - not found
      mockDb.where.mockResolvedValueOnce([]);
      // prefs
      mockDb.where.mockResolvedValueOnce([{ emailNewMeasurements: false }]);

      mockPushSendToUser.mockResolvedValue({ successful: 1, failed: 0 });

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockPushSendToUser).toHaveBeenCalledWith(
        'athlete-1',
        expect.objectContaining({
          body: expect.stringContaining('FLY10_TIME'),
        }),
        'org-1'
      );
    });

    it('should catch and log push errors without throwing', async () => {
      setupMocks();
      mockPushSendToUser.mockRejectedValue(new Error('Push service down'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw
      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'FLY10_TIME',
        value: '1.25',
        units: 's',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('email notification', () => {
    const setupMocksWithEmail = (emailPref: boolean) => {
      // athlete
      mockDb.where.mockResolvedValueOnce([{
        id: 'athlete-1', firstName: 'John', lastName: 'Doe', emails: ['john@test.com'],
      }]);
      // submitter
      mockDb.where.mockResolvedValueOnce([{
        id: 'coach-1', firstName: 'Coach', lastName: 'Smith', fullName: 'Coach Smith',
      }]);
      // siteMetrics
      mockDb.where.mockResolvedValueOnce([{
        code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in',
      }]);
      // prefs
      mockDb.where.mockResolvedValueOnce([{ emailNewMeasurements: emailPref }]);

      mockPushSendToUser.mockResolvedValue({ successful: 1, failed: 0 });
      mockEmailSendNewMeasurement.mockResolvedValue(true);
    };

    it('should skip email when emailNewMeasurements preference is false', async () => {
      setupMocksWithEmail(false);

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'VERTICAL_JUMP',
        value: '32.5',
        units: 'in',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockEmailSendNewMeasurement).not.toHaveBeenCalled();
    });

    it('should send email when emailNewMeasurements preference is true', async () => {
      setupMocksWithEmail(true);

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'VERTICAL_JUMP',
        value: '32.5',
        units: 'in',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(mockEmailSendNewMeasurement).toHaveBeenCalledWith(
        'john@test.com',
        expect.objectContaining({
          athleteName: 'John',
          submitterName: 'Coach Smith',
          metricLabel: 'Vertical Jump',
          value: '32.5',
          units: 'in',
          date: '2025-01-15',
        })
      );
    });

    it('should catch and log email errors without throwing', async () => {
      setupMocksWithEmail(true);
      mockEmailSendNewMeasurement.mockRejectedValue(new Error('Email service down'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await notifyNewMeasurement({
        measurementId: 'meas-1',
        userId: 'athlete-1',
        submittedBy: 'coach-1',
        metric: 'VERTICAL_JUMP',
        value: '32.5',
        units: 'in',
        organizationId: 'org-1',
        date: '2025-01-15',
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
