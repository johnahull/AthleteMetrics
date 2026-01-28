/**
 * Unit tests for wellness-notification-service.ts
 *
 * Mocks storage, email, push, and WellnessAccessService.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  mockGetWellnessTemplate,
  mockGetUser,
  mockGetOrganization,
  mockGetUsersByIds,
  mockGenerateMagicLinksForRequest,
  mockSendWellnessRequest,
  mockSendToUser,
  mockGetPushNotificationService,
} = vi.hoisted(() => ({
  mockGetWellnessTemplate: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetOrganization: vi.fn(),
  mockGetUsersByIds: vi.fn(),
  mockGenerateMagicLinksForRequest: vi.fn(),
  mockSendWellnessRequest: vi.fn(),
  mockSendToUser: vi.fn(),
  mockGetPushNotificationService: vi.fn(),
}));

vi.mock('../../storage', () => ({
  storage: {
    getWellnessTemplate: mockGetWellnessTemplate,
    getUser: mockGetUser,
    getOrganization: mockGetOrganization,
    getUsersByIds: mockGetUsersByIds,
  },
}));

vi.mock('../../db', () => ({
  db: {},
}));

vi.mock('../../services/email-service', () => ({
  emailService: {
    sendWellnessRequest: mockSendWellnessRequest,
  },
}));

vi.mock('../../auth/wellness-access', () => ({
  WellnessAccessService: {
    generateMagicLinksForRequest: mockGenerateMagicLinksForRequest,
  },
}));

vi.mock('../../services/push-notification-service', () => ({
  getPushNotificationService: mockGetPushNotificationService,
}));

import { sendWellnessRequestNotifications } from '../wellness-notification-service';

describe('sendWellnessRequestNotifications', () => {
  const request = { id: 'req-1', publicToken: 'token-abc' };
  const userId = 'user-1';
  const orgId = 'org-1';

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetWellnessTemplate.mockResolvedValue({ name: 'Daily Check', config: { questions: [{ id: 'q1' }] } });
    mockGetUser.mockResolvedValue({ id: userId, fullName: 'Coach Smith' });
    mockGetOrganization.mockResolvedValue({ name: 'Test Org' });
    mockGetUsersByIds.mockResolvedValue([
      { id: 'a-1', fullName: 'John Doe', emails: ['john@example.com'] },
    ]);
    mockGenerateMagicLinksForRequest.mockResolvedValue(
      new Map([['a-1', 'https://example.com/magic/abc']])
    );
    mockSendWellnessRequest.mockResolvedValue(undefined);
    mockSendToUser.mockResolvedValue({ successful: 1, failed: 0 });
    mockGetPushNotificationService.mockReturnValue({ sendToUser: mockSendToUser });
  });

  it('should send magic link emails for magic_link distribution', async () => {
    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'magic_link', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    expect(mockSendWellnessRequest).toHaveBeenCalledWith(
      'john@example.com',
      expect.objectContaining({ athleteName: 'John Doe', coachName: 'Coach Smith' })
    );
    expect(results.emailNotifications).toBeDefined();
    expect(results.emailNotifications!.sent).toBe(1);
  });

  it('should send push notifications for athlete_account distribution', async () => {
    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'athlete_account', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    expect(mockSendToUser).toHaveBeenCalledWith('a-1', expect.any(Object), orgId);
    expect(results.pushNotifications).toBeDefined();
    expect(results.pushNotifications!.sent).toBe(1);
  });

  it('should skip push for qr_code distribution', async () => {
    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'qr_code', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    expect(mockSendToUser).not.toHaveBeenCalled();
    expect(results.pushNotifications).toBeUndefined();
  });

  it('should skip push for team_link distribution', async () => {
    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'team_link', targetTeamIds: ['t-1'] },
      userId,
      orgId
    );

    expect(mockSendToUser).not.toHaveBeenCalled();
    expect(results.pushNotifications).toBeUndefined();
  });

  it('should handle email failure gracefully', async () => {
    mockSendWellnessRequest.mockRejectedValue(new Error('SMTP error'));

    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'magic_link', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    expect(results.emailNotifications!.failed).toBe(1);
    expect(results.emailNotifications!.errors).toHaveLength(1);
  });

  it('should handle push failure gracefully', async () => {
    mockSendToUser.mockRejectedValue(new Error('Push error'));

    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'athlete_account', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    expect(results.pushNotifications!.failed).toBe(1);
    expect(results.pushNotifications!.errors).toHaveLength(1);
  });

  it('should track noSubscription from push result', async () => {
    mockSendToUser.mockResolvedValue({ successful: 0, failed: 0, noSubscription: true });

    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'athlete_account', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    expect(results.pushNotifications!.noSubscription).toBe(1);
  });

  it('should skip email sending when publicToken is null', async () => {
    const results = await sendWellnessRequestNotifications(
      { id: 'req-1', publicToken: null },
      { templateId: 'tmpl-1', distributionMethod: 'magic_link', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    // Email path is skipped (gated by publicToken), but push path still runs
    expect(mockSendWellnessRequest).not.toHaveBeenCalled();
    expect(results.emailNotifications!.sent).toBe(0);
  });

  it('should send both email and push for magic_link distribution', async () => {
    const results = await sendWellnessRequestNotifications(
      request,
      { templateId: 'tmpl-1', distributionMethod: 'magic_link', targetAthleteIds: ['a-1'] },
      userId,
      orgId
    );

    expect(mockSendWellnessRequest).toHaveBeenCalled();
    expect(mockSendToUser).toHaveBeenCalled();
    expect(results.emailNotifications!.sent).toBe(1);
    expect(results.pushNotifications!.sent).toBe(1);
  });
});
