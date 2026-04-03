/**
 * Unit tests — COPPA email templates in EmailService
 *
 * Covers the seven COPPA/minor-related template methods in email-service.ts:
 *  - sendParentalConsentRequest
 *  - sendConsentConfirmedNotification
 *  - sendExportReadyNotification
 *  - sendParentInvitation
 *  - sendDeletionRequestConfirmation
 *  - sendDeletionCompletedNotification
 *  - sendParentNotification (under-18 non-consent notification)
 *
 * Resend SDK is mocked — no real emails are sent.
 * No database connection is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailService } from '../email-service';

// ---------------------------------------------------------------------------
// Mock Resend SDK
// ---------------------------------------------------------------------------

const mockSend = vi.fn();

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the argument object passed to resend.emails.send on the nth call (0-indexed). */
function sentEmail(callIndex = 0): Record<string, any> {
  return mockSend.mock.calls[callIndex][0] as Record<string, any>;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('EmailService — COPPA templates', () => {
  let emailService: EmailService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };

    process.env.RESEND_API_KEY = 'test-api-key-re_12345';
    process.env.EMAIL_FROM_ADDRESS = 'team@athletemetrics.io';
    process.env.EMAIL_FROM_NAME = 'AthleteMetrics Test';
    process.env.APP_URL = 'https://test.athletemetrics.com';

    vi.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'mock-email-id' }, error: null });

    emailService = new EmailService();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // sendParentalConsentRequest
  // -------------------------------------------------------------------------

  describe('sendParentalConsentRequest', () => {
    const validParams = {
      athleteName: 'Jane Doe',
      consentToken: 'abc123token',
      consentId: 'consent-uuid',
      expiresAt: new Date('2026-05-01T00:00:00Z'),
    };

    it('calls Resend with the correct recipient, subject, and html fields', async () => {
      const result = await emailService.sendParentalConsentRequest(
        'parent@example.com',
        validParams,
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('parent@example.com');
      expect(email.subject).toContain("Jane Doe");
      expect(email.html).toBeDefined();
    });

    it('constructs the consent page URL from APP_URL and the token', async () => {
      await emailService.sendParentalConsentRequest('parent@example.com', validParams);

      const email = sentEmail();
      expect(email.html).toContain(
        'https://test.athletemetrics.com/consent/abc123token',
      );
    });

    it('XSS-escapes the athlete name in the HTML body', async () => {
      await emailService.sendParentalConsentRequest('parent@example.com', {
        ...validParams,
        athleteName: '<script>alert("xss")</script>',
      });

      const email = sentEmail();
      expect(email.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(email.html).not.toContain('<script>alert("xss")</script>');
    });

    it('returns false and does not send when parentEmail is invalid', async () => {
      const result = await emailService.sendParentalConsentRequest(
        'not-an-email',
        validParams,
      );

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns false and does not send when parentEmail is empty string', async () => {
      const result = await emailService.sendParentalConsentRequest('', validParams);

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendConsentConfirmedNotification
  // -------------------------------------------------------------------------

  describe('sendConsentConfirmedNotification', () => {
    it('calls Resend with correct recipient and includes athlete name in HTML', async () => {
      const result = await emailService.sendConsentConfirmedNotification(
        'athlete@example.com',
        { athleteName: 'Alex Smith' },
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('athlete@example.com');
      expect(email.html).toContain('Alex Smith');
    });

    it('XSS-escapes the athlete name', async () => {
      await emailService.sendConsentConfirmedNotification('athlete@example.com', {
        athleteName: '<img src=x onerror=alert(1)>',
      });

      const email = sentEmail();
      expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(email.html).not.toContain('<img src=x');
    });

    it('returns false and does not send when athleteEmail is invalid', async () => {
      const result = await emailService.sendConsentConfirmedNotification(
        'bad-email',
        { athleteName: 'Alex' },
      );

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns false when athleteEmail is empty string', async () => {
      const result = await emailService.sendConsentConfirmedNotification('', {
        athleteName: 'Alex',
      });

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendExportReadyNotification
  // -------------------------------------------------------------------------

  describe('sendExportReadyNotification', () => {
    const exportParams = {
      athleteName: 'Jordan Lee',
      downloadUrl: 'https://test.athletemetrics.com/exports/token-abc',
      expiresAt: new Date('2026-04-09T00:00:00Z'),
    };

    it('calls Resend with correct recipient and includes the download URL in HTML', async () => {
      const result = await emailService.sendExportReadyNotification(
        'parent@example.com',
        exportParams,
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('parent@example.com');
      expect(email.html).toContain('https://test.athletemetrics.com/exports/token-abc');
    });

    it('includes the athlete name in HTML', async () => {
      await emailService.sendExportReadyNotification('parent@example.com', exportParams);

      expect(sentEmail().html).toContain('Jordan Lee');
    });

    it('XSS-escapes the athlete name in HTML', async () => {
      await emailService.sendExportReadyNotification('parent@example.com', {
        ...exportParams,
        athleteName: '<b>Injected</b>',
      });

      const email = sentEmail();
      expect(email.html).toContain('&lt;b&gt;Injected&lt;/b&gt;');
      expect(email.html).not.toContain('<b>Injected</b>');
    });

    it('returns false and does not send when parentEmail is invalid', async () => {
      const result = await emailService.sendExportReadyNotification(
        'not-valid',
        exportParams,
      );

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendParentInvitation
  // -------------------------------------------------------------------------

  describe('sendParentInvitation', () => {
    const inviteParams = {
      parentName: 'Bob Parent',
      athleteName: 'Sam Athlete',
      organizationName: 'Riverside High School',
      invitationLink: 'https://test.athletemetrics.com/accept-invitation?token=xyz',
      expiryDays: 7,
    };

    it('calls Resend with correct recipient and includes athlete name and org in HTML', async () => {
      const result = await emailService.sendParentInvitation(
        'parent@example.com',
        inviteParams,
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('parent@example.com');
      expect(email.html).toContain('Sam Athlete');
      expect(email.html).toContain('Riverside High School');
    });

    it('clamps expiryDays to a minimum of 1', async () => {
      await emailService.sendParentInvitation('parent@example.com', {
        ...inviteParams,
        expiryDays: 0,
      });

      // expiryDays clamped to 1 — should show "1 day" in the HTML
      const email = sentEmail();
      expect(email.html).toContain('1 day');
    });

    it('clamps expiryDays to a maximum of 90', async () => {
      await emailService.sendParentInvitation('parent@example.com', {
        ...inviteParams,
        expiryDays: 999,
      });

      const email = sentEmail();
      expect(email.html).toContain('90 days');
    });

    it('uses "Parent/Guardian" as fallback when parentName is omitted', async () => {
      const { parentName: _omitted, ...paramsWithoutName } = inviteParams;
      await emailService.sendParentInvitation('parent@example.com', paramsWithoutName);

      expect(sentEmail().html).toContain('Parent/Guardian');
    });

    it('XSS-escapes athlete name and org name in HTML', async () => {
      await emailService.sendParentInvitation('parent@example.com', {
        ...inviteParams,
        athleteName: '<script>xss</script>',
        organizationName: 'Org & "Team"',
      });

      const email = sentEmail();
      expect(email.html).toContain('&lt;script&gt;xss&lt;/script&gt;');
      expect(email.html).toContain('Org &amp; &quot;Team&quot;');
    });

    it('returns false and does not send when parentEmail is invalid', async () => {
      const result = await emailService.sendParentInvitation('@@invalid', inviteParams);

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendDeletionRequestConfirmation
  // -------------------------------------------------------------------------

  describe('sendDeletionRequestConfirmation', () => {
    const deletionParams = {
      athleteName: 'Taylor Young',
      requestId: 'req-uuid-123',
    };

    it('calls Resend with correct recipient and includes athleteName and requestId in HTML', async () => {
      const result = await emailService.sendDeletionRequestConfirmation(
        'parent@example.com',
        deletionParams,
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('parent@example.com');
      expect(email.html).toContain('Taylor Young');
      expect(email.html).toContain('req-uuid-123');
    });

    it('XSS-escapes the athlete name', async () => {
      await emailService.sendDeletionRequestConfirmation('parent@example.com', {
        ...deletionParams,
        athleteName: '"><script>evil()</script>',
      });

      const email = sentEmail();
      expect(email.html).toContain('&gt;&lt;script&gt;evil()&lt;/script&gt;');
      expect(email.html).not.toContain('<script>evil()');
    });

    it('returns false and does not send when toEmail is invalid', async () => {
      const result = await emailService.sendDeletionRequestConfirmation(
        'bad',
        deletionParams,
      );

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendDeletionCompletedNotification
  // -------------------------------------------------------------------------

  describe('sendDeletionCompletedNotification', () => {
    const completedParams = {
      requestId: 'req-uuid-456',
      deletedCategories: ['measurements (12)', 'wellness_responses (3)', 'user_pii_cleared'],
    };

    it('calls Resend with correct recipient and includes requestId in HTML', async () => {
      const result = await emailService.sendDeletionCompletedNotification(
        'parent@example.com',
        completedParams,
      );

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('parent@example.com');
      expect(email.html).toContain('req-uuid-456');
    });

    it('renders each deleted category in the HTML', async () => {
      await emailService.sendDeletionCompletedNotification(
        'parent@example.com',
        completedParams,
      );

      const email = sentEmail();
      for (const category of completedParams.deletedCategories) {
        expect(email.html).toContain(category);
      }
    });

    it('XSS-escapes each deleted category string', async () => {
      await emailService.sendDeletionCompletedNotification('parent@example.com', {
        requestId: 'req-safe',
        deletedCategories: ['<script>pwned</script>'],
      });

      const email = sentEmail();
      expect(email.html).toContain('&lt;script&gt;pwned&lt;/script&gt;');
      expect(email.html).not.toContain('<script>pwned</script>');
    });

    it('returns false and does not send when toEmail is invalid', async () => {
      const result = await emailService.sendDeletionCompletedNotification(
        'not-valid@@',
        completedParams,
      );

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendParentNotification (under-18 non-consent notification)
  // -------------------------------------------------------------------------

  describe('sendParentNotification', () => {
    const validParams = {
      parentEmail: 'guardian@example.com',
      athleteFirstName: 'Jordan',
    };

    it('sends notification email with correct to and subject', async () => {
      const result = await emailService.sendParentNotification(validParams);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('guardian@example.com');
      expect(email.subject).toContain('Jordan');
    });

    it('includes athlete name (XSS-escaped) in HTML body', async () => {
      const result = await emailService.sendParentNotification({
        parentEmail: 'guardian@example.com',
        athleteFirstName: '<script>alert("xss")</script>',
      });

      expect(result).toBe(true);
      const email = sentEmail();
      expect(email.html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(email.html).not.toContain('<script>alert("xss")</script>');
    });

    it('includes parent registration link constructed from APP_URL', async () => {
      const result = await emailService.sendParentNotification(validParams);

      expect(result).toBe(true);
      const email = sentEmail();
      const encodedEmail = encodeURIComponent('guardian@example.com');
      expect(email.html).toContain(
        `https://test.athletemetrics.com/register?role=parent&email=${encodedEmail}`,
      );
    });

    it('returns false for invalid email', async () => {
      const result = await emailService.sendParentNotification({
        parentEmail: 'not-an-email',
        athleteFirstName: 'Jordan',
      });

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns false for empty email', async () => {
      const result = await emailService.sendParentNotification({
        parentEmail: '',
        athleteFirstName: 'Jordan',
      });

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
