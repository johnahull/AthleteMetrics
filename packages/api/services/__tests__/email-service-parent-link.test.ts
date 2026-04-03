/**
 * Unit tests — Parent link request email templates in EmailService
 *
 * Covers the two new Phase 3 template methods:
 *  - sendParentLinkRequestToCoach
 *  - sendParentLinkRequestResult
 *
 * Resend SDK is mocked — no real emails are sent.
 * No database connection is required.
 *
 * Run:
 *   npm run test:run -- packages/api/services/__tests__/email-service-parent-link.test.ts
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

describe('EmailService — parent link request templates', () => {
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
  // sendParentLinkRequestToCoach
  // -------------------------------------------------------------------------

  describe('sendParentLinkRequestToCoach', () => {
    const validParams = {
      to: 'coach@example.com',
      coachName: 'Coach Adams',
      parentName: 'Jane Smith',
      childName: 'Tommy Smith',
    };

    it('calls Resend with the correct recipient and subject', async () => {
      const result = await emailService.sendParentLinkRequestToCoach(validParams);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('coach@example.com');
      expect(email.subject).toContain('Tommy Smith');
    });

    it('includes parent name and child name in the HTML body', async () => {
      await emailService.sendParentLinkRequestToCoach(validParams);

      const email = sentEmail();
      expect(email.html).toContain('Jane Smith');
      expect(email.html).toContain('Tommy Smith');
      expect(email.html).toContain('Coach Adams');
    });

    it('includes both html and text fields', async () => {
      await emailService.sendParentLinkRequestToCoach(validParams);

      const email = sentEmail();
      expect(typeof email.html).toBe('string');
      expect(email.html.length).toBeGreaterThan(0);
      expect(typeof email.text).toBe('string');
      expect(email.text.length).toBeGreaterThan(0);
    });

    it('plain text includes parent and child names', async () => {
      await emailService.sendParentLinkRequestToCoach(validParams);

      const email = sentEmail();
      expect(email.text).toContain('Jane Smith');
      expect(email.text).toContain('Tommy Smith');
    });

    it('XSS-escapes the parent name in HTML', async () => {
      await emailService.sendParentLinkRequestToCoach({
        ...validParams,
        parentName: '<script>alert("xss")</script>',
      });

      const email = sentEmail();
      expect(email.html).toContain('&lt;script&gt;');
      expect(email.html).not.toContain('<script>alert("xss")</script>');
    });

    it('XSS-escapes the child name in HTML', async () => {
      await emailService.sendParentLinkRequestToCoach({
        ...validParams,
        childName: '<img src=x onerror=alert(1)>',
      });

      const email = sentEmail();
      expect(email.html).not.toContain('<img src=x');
      expect(email.html).toContain('&lt;img');
    });

    it('XSS-escapes the coach name in HTML', async () => {
      await emailService.sendParentLinkRequestToCoach({
        ...validParams,
        coachName: '<b>Evil</b>',
      });

      const email = sentEmail();
      expect(email.html).not.toContain('<b>Evil</b>');
      expect(email.html).toContain('&lt;b&gt;Evil&lt;/b&gt;');
    });

    it('returns false and does not send when "to" email is invalid', async () => {
      const result = await emailService.sendParentLinkRequestToCoach({
        ...validParams,
        to: 'not-an-email',
      });

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns false and does not send when "to" email is empty string', async () => {
      const result = await emailService.sendParentLinkRequestToCoach({
        ...validParams,
        to: '',
      });

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('subject includes the child name', async () => {
      await emailService.sendParentLinkRequestToCoach(validParams);

      const email = sentEmail();
      expect(email.subject).toMatch(/Tommy Smith/);
    });
  });

  // -------------------------------------------------------------------------
  // sendParentLinkRequestResult — approved
  // -------------------------------------------------------------------------

  describe('sendParentLinkRequestResult — approved', () => {
    const approvedParams = {
      to: 'parent@example.com',
      childName: 'Tommy Smith',
      approved: true,
    };

    it('calls Resend with correct recipient and includes "approved" in the subject', async () => {
      const result = await emailService.sendParentLinkRequestResult(approvedParams);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('parent@example.com');
      expect(email.subject.toLowerCase()).toContain('approved');
    });

    it('subject contains the child name', async () => {
      await emailService.sendParentLinkRequestResult(approvedParams);

      const email = sentEmail();
      expect(email.subject).toContain('Tommy Smith');
    });

    it('HTML body contains the child name and approval message', async () => {
      await emailService.sendParentLinkRequestResult(approvedParams);

      const email = sentEmail();
      expect(email.html).toContain('Tommy Smith');
      expect(email.html.toLowerCase()).toContain('approved');
    });

    it('HTML body mentions parent dashboard access on approval', async () => {
      await emailService.sendParentLinkRequestResult(approvedParams);

      const email = sentEmail();
      expect(email.html.toLowerCase()).toContain('dashboard');
    });

    it('plain text includes approval outcome', async () => {
      await emailService.sendParentLinkRequestResult(approvedParams);

      const email = sentEmail();
      expect(email.text.toLowerCase()).toContain('approved');
      expect(email.text).toContain('Tommy Smith');
    });

    it('XSS-escapes the child name in approved HTML', async () => {
      await emailService.sendParentLinkRequestResult({
        ...approvedParams,
        childName: '<script>xss</script>',
      });

      const email = sentEmail();
      expect(email.html).not.toContain('<script>xss</script>');
      expect(email.html).toContain('&lt;script&gt;');
    });

    it('does NOT include denial reason text when approved', async () => {
      await emailService.sendParentLinkRequestResult(approvedParams);

      const email = sentEmail();
      // Approval email must not have denial wording
      expect(email.html.toLowerCase()).not.toContain('denied');
    });

    it('returns false and does not send when "to" email is invalid', async () => {
      const result = await emailService.sendParentLinkRequestResult({
        ...approvedParams,
        to: 'bad-email',
      });

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // sendParentLinkRequestResult — denied
  // -------------------------------------------------------------------------

  describe('sendParentLinkRequestResult — denied', () => {
    const deniedParams = {
      to: 'parent@example.com',
      childName: 'Tommy Smith',
      approved: false,
      denialReason: 'Could not verify parental relationship',
    };

    it('calls Resend with correct recipient and includes "denied" in the subject', async () => {
      const result = await emailService.sendParentLinkRequestResult(deniedParams);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);

      const email = sentEmail();
      expect(email.to).toBe('parent@example.com');
      expect(email.subject.toLowerCase()).toContain('denied');
    });

    it('HTML body contains the denial reason when provided', async () => {
      await emailService.sendParentLinkRequestResult(deniedParams);

      const email = sentEmail();
      expect(email.html).toContain('Could not verify parental relationship');
    });

    it('HTML body includes denial word', async () => {
      await emailService.sendParentLinkRequestResult(deniedParams);

      const email = sentEmail();
      expect(email.html.toLowerCase()).toContain('denied');
    });

    it('plain text includes denial reason', async () => {
      await emailService.sendParentLinkRequestResult(deniedParams);

      const email = sentEmail();
      expect(email.text).toContain('Could not verify parental relationship');
    });

    it('HTML body contains generic message when no denial reason provided', async () => {
      await emailService.sendParentLinkRequestResult({
        to: 'parent@example.com',
        childName: 'Tommy Smith',
        approved: false,
        // no denialReason
      });

      const email = sentEmail();
      // Should have some generic denial message (contact org)
      expect(email.html.toLowerCase()).toContain('organization');
    });

    it('XSS-escapes the denial reason in HTML', async () => {
      await emailService.sendParentLinkRequestResult({
        ...deniedParams,
        denialReason: '<script>badstuff</script>',
      });

      const email = sentEmail();
      expect(email.html).not.toContain('<script>badstuff</script>');
      expect(email.html).toContain('&lt;script&gt;');
    });

    it('XSS-escapes the child name in denied HTML', async () => {
      await emailService.sendParentLinkRequestResult({
        ...deniedParams,
        childName: '<img src=x>',
      });

      const email = sentEmail();
      expect(email.html).not.toContain('<img src=x>');
      expect(email.html).toContain('&lt;img');
    });

    it('does NOT include approval-only text when denied', async () => {
      await emailService.sendParentLinkRequestResult(deniedParams);

      const email = sentEmail();
      // Denial email must not claim the parent can view the dashboard
      expect(email.html.toLowerCase()).not.toContain('you can now view');
    });

    it('returns false and does not send when "to" email is empty', async () => {
      const result = await emailService.sendParentLinkRequestResult({
        ...deniedParams,
        to: '',
      });

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
