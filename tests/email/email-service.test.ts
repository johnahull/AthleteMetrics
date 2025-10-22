import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../../packages/api/services/email-service';

// Mock SendGrid
vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn().mockResolvedValue([{ statusCode: 202 }]),
  },
}));

describe('EmailService', () => {
  let emailService: EmailService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset only the email-related env vars we modify in tests
    ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL', 'SENDGRID_FROM_NAME'].forEach(key => {
      if (key in originalEnv) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore only the email-related env vars we modify in tests
    ['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL', 'SENDGRID_FROM_NAME'].forEach(key => {
      if (key in originalEnv) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    });
  });

  describe('constructor', () => {
    it('should initialize with SendGrid API key when provided', () => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      process.env.SENDGRID_FROM_EMAIL = 'test@example.com';
      process.env.SENDGRID_FROM_NAME = 'Test Sender';

      emailService = new EmailService();

      expect(emailService).toBeDefined();
    });

    it('should work without API key (disabled mode)', () => {
      delete process.env.SENDGRID_API_KEY;

      emailService = new EmailService();

      expect(emailService).toBeDefined();
    });
  });

  describe('sendInvitation', () => {
    beforeEach(() => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      emailService = new EmailService();
    });

    it('should send invitation email with correct data', async () => {
      const sgMail = await import('@sendgrid/mail');

      const result = await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/invite/token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      expect(result).toBe(true);
      expect(sgMail.default.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: "You've been invited to join Test Org on AthleteMetrics",
          html: expect.stringContaining('John Doe'),
          html: expect.stringContaining('Jane Smith'),
          html: expect.stringContaining('Test Org'),
          html: expect.stringContaining('https://example.com/invite/token123'),
        })
      );
    });

    it('should return false when email sending fails', async () => {
      const sgMail = await import('@sendgrid/mail');
      vi.mocked(sgMail.default.send).mockRejectedValueOnce(new Error('SendGrid error'));

      const result = await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/invite/token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      expect(result).toBe(false);
    });

    it('should return false when API key is not configured', async () => {
      delete process.env.SENDGRID_API_KEY;
      emailService = new EmailService();

      const result = await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/invite/token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendWelcome', () => {
    beforeEach(() => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      emailService = new EmailService();
    });

    it('should send welcome email with correct data', async () => {
      const sgMail = await import('@sendgrid/mail');

      const result = await emailService.sendWelcome('user@example.com', {
        userName: 'John Doe',
        organizationName: 'Test Org',
        role: 'Coach',
      });

      expect(result).toBe(true);
      expect(sgMail.default.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Welcome to Test Org on AthleteMetrics!',
          html: expect.stringContaining('John Doe'),
          html: expect.stringContaining('Test Org'),
          html: expect.stringContaining('Coach'),
        })
      );
    });
  });

  describe('sendEmailVerification', () => {
    beforeEach(() => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      emailService = new EmailService();
    });

    it('should send verification email with correct data', async () => {
      const sgMail = await import('@sendgrid/mail');

      const result = await emailService.sendEmailVerification('user@example.com', {
        userName: 'John Doe',
        verificationLink: 'https://example.com/verify/token123',
      });

      expect(result).toBe(true);
      expect(sgMail.default.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Verify your email address',
          html: expect.stringContaining('John Doe'),
          html: expect.stringContaining('https://example.com/verify/token123'),
        })
      );
    });
  });

  describe('sendPasswordReset', () => {
    beforeEach(() => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      emailService = new EmailService();
    });

    it('should send password reset email with correct data', async () => {
      const sgMail = await import('@sendgrid/mail');

      const result = await emailService.sendPasswordReset('user@example.com', {
        userName: 'John Doe',
        resetLink: 'https://example.com/reset/token123',
      });

      expect(result).toBe(true);
      expect(sgMail.default.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Reset your AthleteMetrics password',
          html: expect.stringContaining('John Doe'),
          html: expect.stringContaining('https://example.com/reset/token123'),
        })
      );
    });
  });

  describe('HTML template generation', () => {
    beforeEach(() => {
      process.env.SENDGRID_API_KEY = 'test-api-key';
      emailService = new EmailService();
    });

    it('should include all required fields in invitation template', async () => {
      const sgMail = await import('@sendgrid/mail');

      await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/invite/token123',
        expiryDays: 7,
        role: 'Organization Admin',
      });

      const call = vi.mocked(sgMail.default.send).mock.calls[0][0];
      expect(call.html).toContain('AthleteMetrics');
      expect(call.html).toContain('Accept Invitation');
      expect(call.html).toContain('7 days');
      expect(call.html).toContain('Organization Admin');
    });

    it('should generate proper plain text fallback', async () => {
      const sgMail = await import('@sendgrid/mail');

      await emailService.sendInvitation('user@example.com', {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Test Org',
        invitationLink: 'https://example.com/invite/token123',
        expiryDays: 7,
        role: 'Athlete',
      });

      const call = vi.mocked(sgMail.default.send).mock.calls[0][0];
      expect(call.text).toBeDefined();
      expect(call.text).not.toContain('<');
      expect(call.text).not.toContain('>');
    });
  });
});
