import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailService } from '../../packages/api/services/email-service';

// Mock Resend
const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockSend
    }
  }))
}));

describe('EmailService', () => {
  let emailService: EmailService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up test environment variables
    process.env.RESEND_API_KEY = 'test-api-key-re_12345';
    process.env.EMAIL_FROM_ADDRESS = 'team@athletemetrics.io';
    process.env.EMAIL_FROM_NAME = 'AthleteMetrics Test';

    // Reset mock to default success response
    mockSend.mockResolvedValue({ data: { id: 'test-id' }, error: null });

    emailService = new EmailService();
  });

  afterEach(() => {
    // Restore only the email-related env vars we modify in tests
    ['RESEND_API_KEY', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME'].forEach(key => {
      if (key in originalEnv) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  describe('constructor', () => {
    it('should initialize with Resend API key when provided', () => {
      process.env.RESEND_API_KEY = 'test-api-key';
      process.env.EMAIL_FROM_ADDRESS = 'test@example.com';
      process.env.EMAIL_FROM_NAME = 'Test Sender';

      emailService = new EmailService();

      expect(emailService).toBeDefined();
    });

    it('should work without API key (disabled mode)', () => {
      delete process.env.RESEND_API_KEY;

      emailService = new EmailService();

      expect(emailService).toBeDefined();
    });
  });

  describe('sendInvitation', () => {
    it('should send invitation email with correct data', async () => {
      const result = await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/accept-invitation?token=token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: "You've been invited to join Test Org on AthleteMetrics",
          from: 'AthleteMetrics Test <team@athletemetrics.io>',
        })
      );

      const sentEmail = mockSend.mock.calls[0][0];
      expect(sentEmail.html).toContain('John Doe');
      expect(sentEmail.html).toContain('Jane Smith');
      expect(sentEmail.html).toContain('Test Org');
      expect(sentEmail.html).toContain('https://example.com/accept-invitation?token=token123');
    });

    it('should return false when email sending fails', async () => {
      mockSend.mockResolvedValueOnce({ data: null, error: { message: 'Resend error' } });

      const result = await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/accept-invitation?token=token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      expect(result).toBe(false);
    });

    it('should return false when API key is not configured', async () => {
      delete process.env.RESEND_API_KEY;
      emailService = new EmailService();

      const result = await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/accept-invitation?token=token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendWelcome', () => {
    it('should send welcome email with correct data', async () => {
      const result = await emailService.sendWelcome('user@example.com', {
        userName: 'John Doe',
        organizationName: 'Test Org',
        role: 'Coach',
      });

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome to Test Org on AthleteMetrics!',
        })
      );

      const sentEmail = mockSend.mock.calls[0][0];
      expect(sentEmail.html).toContain('John Doe');
      expect(sentEmail.html).toContain('Test Org');
      expect(sentEmail.html).toContain('Coach');
    });
  });

  describe('sendEmailVerification', () => {
    it('should send verification email with correct data', async () => {
      const result = await emailService.sendEmailVerification('user@example.com', {
        userName: 'John Doe',
        verificationLink: 'https://example.com/verify-email?token=token123',
      });

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Verify your email address',
        })
      );

      const sentEmail = mockSend.mock.calls[0][0];
      expect(sentEmail.html).toContain('John Doe');
      expect(sentEmail.html).toContain('https://example.com/verify-email?token=token123');
    });
  });

  describe('sendPasswordReset', () => {
    it('should send password reset email with correct data', async () => {
      const result = await emailService.sendPasswordReset('user@example.com', {
        userName: 'John Doe',
        resetLink: 'https://example.com/reset-password?token=token123',
      });

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Reset your AthleteMetrics password',
        })
      );

      const sentEmail = mockSend.mock.calls[0][0];
      expect(sentEmail.html).toContain('John Doe');
      expect(sentEmail.html).toContain('https://example.com/reset-password?token=token123');
    });
  });

  describe('HTML template generation', () => {
    it('should include all required fields in invitation template', async () => {
      await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/accept-invitation?token=token123',
        expiryDays: 7,
        role: 'Organization Admin',
      });

      const sentEmail = mockSend.mock.calls[0][0];
      expect(sentEmail.html).toContain('AthleteMetrics');
      expect(sentEmail.html).toContain('Accept Invitation');
      expect(sentEmail.html).toContain('7 days');
      expect(sentEmail.html).toContain('Organization Admin');
    });

    it('should generate proper plain text fallback', async () => {
      await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/accept-invitation?token=token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      const sentEmail = mockSend.mock.calls[0][0];
      expect(sentEmail.text).toBeDefined();
      expect(sentEmail.text).not.toContain('<html>');
      expect(sentEmail.text).not.toContain('<table>');
    });
  });
});
