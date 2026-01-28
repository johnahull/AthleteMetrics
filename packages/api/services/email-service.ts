/**
 * Email Service
 * Handles all email sending operations using Resend
 */

import { Resend } from 'resend';

/**
 * HTML escape function to prevent XSS in email templates
 * Escapes characters that have special meaning in HTML
 */
function escapeHtml(unsafe: string | undefined | null): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitize URL to prevent javascript: protocol and other injection attacks
 * Only allows http:, https:, and mailto: protocols
 * For invitation links, validates the expected URL structure
 */
function sanitizeUrl(url: string | undefined | null, expectedType?: 'invitation' | 'verification' | 'password-reset'): string {
  if (!url) return '#';

  const urlString = String(url).trim();

  // Check for dangerous protocols (javascript:, data:, file:, etc.)
  const dangerousProtocols = /^(javascript|data|file|vbscript):/i;
  if (dangerousProtocols.test(urlString)) {
    console.error('⚠️ Dangerous URL protocol detected and blocked:', urlString);
    return '#';
  }

  // Only allow http:, https:, and mailto: protocols
  const allowedProtocols = /^(https?|mailto):/i;
  if (!allowedProtocols.test(urlString)) {
    // If no protocol, assume it's a relative URL - make it safe
    return '#';
  }

  // Additional validation for expected URL types
  if (expectedType) {
    const urlPatterns = {
      invitation: /^https?:\/\/[^\/]+\/accept-invitation\?token=.+$/,
      verification: /^https?:\/\/[^\/]+\/verify-email\?token=.+$/,
      'password-reset': /^https?:\/\/[^\/]+\/reset-password\?token=.+$/
    };

    const pattern = urlPatterns[expectedType];
    if (pattern && !pattern.test(urlString)) {
      console.warn(`⚠️ URL does not match expected ${expectedType} format:`, urlString.substring(0, 50));
      // Still allow it through since the token validation happens elsewhere
      // This is defense-in-depth, not a hard security boundary
    }
  }

  return urlString;
}

/**
 * Validate email address format and check for header injection attempts
 * RFC 5322 simplified validation with newline protection
 * @param email - Email address to validate
 * @returns true if email is valid and safe
 */
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;

  // Check for header injection characters (newlines, carriage returns)
  if (email.includes('\n') || email.includes('\r')) {
    console.error('⚠️ Blocked email header injection attempt:', email.substring(0, 50));
    return false;
  }

  // RFC 5322 simplified validation - basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.warn('⚠️ Invalid email format:', email.substring(0, 50));
    return false;
  }

  // Additional length check (prevent extremely long emails that could cause issues)
  if (email.length > 254) {
    console.warn('⚠️ Email exceeds maximum length (254 chars):', email.length);
    return false;
  }

  return true;
}

// Resend client is initialized in the EmailService class

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface InvitationEmailData {
  recipientName: string;
  inviterName: string;
  organizationName: string;
  invitationLink: string;
  expiryDays: number;
  role?: string;
}

interface WelcomeEmailData {
  userName: string;
  organizationName: string;
  role: string;
}

interface EmailVerificationData {
  userName: string;
  verificationLink: string;
}

interface PasswordResetData {
  userName: string;
  resetLink: string;
}

interface WellnessRequestEmailData {
  athleteName: string;
  coachName: string;
  organizationName: string;
  magicLink: string;
  expiryDays: number;
  templateName: string;
  estimatedMinutes: number;
}

interface WellnessReminderEmailData {
  athleteName: string;
  coachName: string;
  organizationName: string;
  magicLink: string;
  hoursUntilExpiry: number;
  templateName: string;
}

interface WellnessAlertEmailData {
  coachName: string;
  athleteName: string;
  alertType: string;
  summary: string;
  viewLink: string;
}

interface AccountLinkedNotificationData {
  email: string;
  userName: string;
  globalAthleteName: string;
  linkedOrganizations: string[];
}

interface ClaimVerificationEmailData {
  email: string;
  userName: string;
  verificationLink: string;
}

interface EventInvitationEmailData {
  to: string;
  recipientName?: string;
  eventName: string;
  eventDate: Date;
  eventLocation?: string;
  inviterName: string;
  organizationName?: string;
  acceptUrl: string;
  expiresAt: Date;
}

interface NewMeasurementEmailData {
  athleteName: string;
  submitterName: string;
  metricLabel: string;
  value: string;
  units: string;
  date: string;
}

interface ReportSharedEmailData {
  athleteName: string;
  coachName: string;
  organizationName: string;
  reportName: string;
  message?: string;
  viewUrl: string;
}

export class EmailService {
  private resend: Resend | null = null;
  private fromEmail: string;
  private fromName: string;
  private enabled: boolean;

  constructor() {
    this.fromEmail = process.env.EMAIL_FROM_ADDRESS || 'team@athletemetrics.io';
    this.fromName = process.env.EMAIL_FROM_NAME || 'AthleteMetrics';
    this.enabled = !!process.env.RESEND_API_KEY;

    if (this.enabled) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    } else {
      console.warn('⚠️ Resend API key not configured. Email sending is disabled.');
    }
  }

  /**
   * Send a raw email
   */
  private async sendEmail(options: EmailOptions): Promise<boolean> {
    // Validate email address to prevent header injection
    if (!isValidEmail(options.to)) {
      console.error(`❌ Rejected invalid email address: ${options.to.substring(0, 50)}`);
      return false;
    }

    if (!this.enabled || !this.resend) {
      console.log('📧 Email sending disabled (no API key). Would have sent:', {
        to: options.to,
        subject: options.subject
      });
      return false;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html)
      });

      if (error) {
        console.error(`❌ Failed to send email to ${options.to} (subject: "${options.subject}") - Resend API error:`, error);
        return false;
      }

      console.log(`✅ Email sent successfully to ${options.to} (subject: "${options.subject}", id: ${data?.id})`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send email to ${options.to} (subject: "${options.subject}") - exception:`, error);
      return false;
    }
  }

  /**
   * Strip HTML tags for plain text version
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  /**
   * Send invitation email
   */
  async sendInvitation(email: string, data: InvitationEmailData): Promise<boolean> {
    const html = this.generateInvitationTemplate(data);

    return this.sendEmail({
      to: email,
      subject: `You've been invited to join ${data.organizationName} on AthleteMetrics`,
      html
    });
  }

  /**
   * Send welcome email after successful signup
   */
  async sendWelcome(email: string, data: WelcomeEmailData): Promise<boolean> {
    const html = this.generateWelcomeTemplate(data);

    return this.sendEmail({
      to: email,
      subject: `Welcome to ${data.organizationName} on AthleteMetrics!`,
      html
    });
  }

  /**
   * Send email verification link
   */
  async sendEmailVerification(email: string, data: EmailVerificationData): Promise<boolean> {
    const html = this.generateVerificationTemplate(data);

    return this.sendEmail({
      to: email,
      subject: 'Verify your email address',
      html
    });
  }

  /**
   * Send password reset link
   */
  async sendPasswordReset(email: string, data: PasswordResetData): Promise<boolean> {
    const html = this.generatePasswordResetTemplate(data);

    return this.sendEmail({
      to: email,
      subject: 'Reset your AthleteMetrics password',
      html
    });
  }

  /**
   * Send OAuth account linking confirmation email
   */
  async sendAccountLinkingEmail(
    email: string,
    firstName: string,
    provider: 'google' | 'apple',
    token: string
  ): Promise<boolean> {
    const html = this.generateAccountLinkingTemplate({ email, firstName, provider, token });

    return this.sendEmail({
      to: email,
      subject: `Confirm ${provider === 'google' ? 'Google' : 'Apple'} Account Linking - AthleteMetrics`,
      html
    });
  }

  /**
   * Send wellness questionnaire request notification
   */
  async sendWellnessRequest(email: string, data: WellnessRequestEmailData): Promise<boolean> {
    const html = this.generateWellnessRequestTemplate(data);

    return this.sendEmail({
      to: email,
      subject: `${data.coachName} has sent you a wellness check from ${data.organizationName}`,
      html
    });
  }

  /**
   * Send wellness questionnaire reminder notification
   */
  async sendWellnessReminder(email: string, data: WellnessReminderEmailData): Promise<boolean> {
    const html = this.generateWellnessReminderTemplate(data);

    return this.sendEmail({
      to: email,
      subject: `Reminder: Complete your wellness check for ${data.organizationName}`,
      html
    });
  }

  /**
   * Send wellness alert notification to coaches
   */
  async sendWellnessAlert(email: string, data: WellnessAlertEmailData): Promise<boolean> {
    const html = this.generateWellnessAlertTemplate(data);

    return this.sendEmail({
      to: email,
      subject: `Wellness Alert: ${data.athleteName} - ${data.alertType}`,
      html
    });
  }

  /**
   * Send notification when user's account is auto-linked to a global athlete
   */
  async sendAccountLinkedNotification(data: AccountLinkedNotificationData): Promise<boolean> {
    const html = this.generateAccountLinkedTemplate(data);

    return this.sendEmail({
      to: data.email,
      subject: 'Your AthleteMetrics accounts have been linked',
      html
    });
  }

  /**
   * Send verification email for manual account claim
   */
  async sendClaimVerificationEmail(data: ClaimVerificationEmailData): Promise<boolean> {
    const html = this.generateClaimVerificationTemplate(data);

    return this.sendEmail({
      to: data.email,
      subject: 'Verify your email to link your AthleteMetrics account',
      html
    });
  }

  /**
   * Send report shared notification email
   */
  async sendReportSharedNotification(email: string, data: ReportSharedEmailData): Promise<boolean> {
    const html = this.generateReportSharedTemplate(data);

    return this.sendEmail({
      to: email,
      subject: `New Performance Report from ${data.coachName}`,
      html
    });
  }

  /**
   * Send event invitation email
   */
  async sendEventInvitation(data: EventInvitationEmailData): Promise<boolean> {
    const html = this.generateEventInvitationTemplate(data);

    const orgPart = data.organizationName ? ` from ${data.organizationName}` : '';

    return this.sendEmail({
      to: data.to,
      subject: `You've been invited to ${data.eventName}${orgPart}`,
      html
    });
  }

  /**
   * Send new measurement notification email
   */
  async sendNewMeasurementNotification(email: string, data: NewMeasurementEmailData): Promise<boolean> {
    const html = this.generateNewMeasurementTemplate(data);

    return this.sendEmail({
      to: email,
      subject: `New measurement recorded: ${data.metricLabel}`,
      html
    });
  }

  /**
   * Generate new measurement notification template
   */
  private generateNewMeasurementTemplate(data: NewMeasurementEmailData): string {
    try {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Measurement Recorded</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">New Measurement Recorded</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.athleteName)},
              </p>

              <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                <strong>${escapeHtml(data.submitterName)}</strong> has recorded a new measurement for you.
              </p>

              <!-- Measurement Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px; color: #1e40af; font-size: 18px; font-weight: 600;">
                      ${escapeHtml(data.metricLabel)}
                    </p>
                    <p style="margin: 0 0 8px; color: #1e3a8a; font-size: 24px; font-weight: 700;">
                      ${escapeHtml(data.value)} ${escapeHtml(data.units)}
                    </p>
                    <p style="margin: 0; color: #3b82f6; font-size: 14px;">
                      Recorded on ${escapeHtml(data.date)} by ${escapeHtml(data.submitterName)}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${process.env.APP_URL || 'https://athletemetrics.app'}/my-measurements" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      View Your Measurements
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                AthleteMetrics - Athletic Performance Tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate new measurement email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate invitation email template
   */
  private generateInvitationTemplate(data: InvitationEmailData): string {
    try {
      // Generate the invitation URL once to ensure consistency between button and display text
      // Sanitize URL to prevent XSS and injection attacks
      const invitationUrl = sanitizeUrl(data.invitationLink, 'invitation');

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to AthleteMetrics</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">AthleteMetrics</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1a202c; font-size: 24px; font-weight: 600;">
                You've been invited!
              </h2>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.recipientName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                <strong>${escapeHtml(data.inviterName)}</strong> has invited you to join <strong>${escapeHtml(data.organizationName)}</strong> on AthleteMetrics${data.role ? ` as a <strong>${escapeHtml(data.role)}</strong>` : ''}.
              </p>

              <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                AthleteMetrics helps track and analyze athletic performance data, providing valuable insights for coaches and athletes.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${invitationUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${invitationUrl}
              </p>

              <p style="margin: 0; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                This invitation will expire in ${data.expiryDays} days.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                This email was sent by AthleteMetrics. If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate invitation email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate welcome email template
   */
  private generateWelcomeTemplate(data: WelcomeEmailData): string {
    try {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to AthleteMetrics</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Welcome to AthleteMetrics!</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.userName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Welcome to <strong>${escapeHtml(data.organizationName)}</strong> on AthleteMetrics! Your account has been successfully created.
              </p>

              <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                You can now start tracking and analyzing performance data. Your role is: <strong>${escapeHtml(data.role)}</strong>.
              </p>

              <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.6;">
                If you have any questions, don't hesitate to reach out to your organization administrator.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                AthleteMetrics - Athletic Performance Tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate welcome email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate email verification template
   */
  private generateVerificationTemplate(data: EmailVerificationData): string {
    try {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Verify Your Email</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.userName)},
              </p>

              <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Please verify your email address by clicking the button below:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizeUrl(data.verificationLink, 'verification')}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${escapeHtml(sanitizeUrl(data.verificationLink, 'verification'))}
              </p>

              <p style="margin: 0; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                This verification link will expire in 24 hours.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                If you didn't create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate verification email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate password reset template
   */
  private generatePasswordResetTemplate(data: PasswordResetData): string {
    try {
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Reset Your Password</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.userName)},
              </p>

              <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to create a new password:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizeUrl(data.resetLink, 'password-reset')}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${escapeHtml(sanitizeUrl(data.resetLink, 'password-reset'))}
              </p>

              <p style="margin: 0; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                AthleteMetrics - Athletic Performance Tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate password reset email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate OAuth account linking confirmation template
   */
  private generateAccountLinkingTemplate(data: { email: string, firstName: string, provider: 'google' | 'apple', token: string }): string {
    try {
      const providerName = data.provider === 'google' ? 'Google' : 'Apple';
      const linkUrl = `${process.env.APP_URL}/api/auth/link-account/${data.token}`;
      const sanitizedLinkUrl = sanitizeUrl(linkUrl);

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm ${providerName} Account Linking</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Confirm ${providerName} Account Linking</h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.firstName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Someone tried to sign in to your AthleteMetrics account using ${providerName}.
              </p>

              <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                To link your ${providerName} account and enable social sign-in, please click the button below:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizedLinkUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Confirm Account Linking
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${escapeHtml(sanitizedLinkUrl)}
              </p>

              <p style="margin: 0 0 16px; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                This link will expire in 1 hour.
              </p>

              <p style="margin: 0; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                If you didn't request this, please ignore this email and consider changing your password.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                AthleteMetrics - Athletic Performance Tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate account linking email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate wellness request email template
   */
  private generateWellnessRequestTemplate(data: WellnessRequestEmailData): string {
    try {
      const sanitizedMagicLink = sanitizeUrl(data.magicLink);

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wellness Check Request</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Wellness Check</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1a202c; font-size: 22px; font-weight: 600;">
                How are you feeling today?
              </h2>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.athleteName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                <strong>${escapeHtml(data.coachName)}</strong> from <strong>${escapeHtml(data.organizationName)}</strong> has sent you a wellness questionnaire: <strong>${escapeHtml(data.templateName)}</strong>.
              </p>

              <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Your feedback helps us understand how you're doing and provide better support. This should take about <strong>${data.estimatedMinutes} minutes</strong> to complete.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizedMagicLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Complete Wellness Check
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #10b981; font-size: 14px; word-break: break-all;">
                ${escapeHtml(data.magicLink)}
              </p>

              <p style="margin: 0; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                This link will expire in ${data.expiryDays} days. Your responses are confidential and help us support your well-being.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                This email was sent by ${escapeHtml(data.organizationName)} via AthleteMetrics.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate wellness request email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate wellness reminder email template
   */
  private generateWellnessReminderTemplate(data: WellnessReminderEmailData): string {
    try {
      const sanitizedMagicLink = sanitizeUrl(data.magicLink);

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wellness Check Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Reminder: Wellness Check</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.athleteName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                This is a friendly reminder to complete your wellness questionnaire: <strong>${escapeHtml(data.templateName)}</strong>.
              </p>

              <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Your feedback is important to <strong>${escapeHtml(data.coachName)}</strong> and the team at <strong>${escapeHtml(data.organizationName)}</strong>.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizedMagicLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Complete Now
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #f59e0b; font-size: 14px; word-break: break-all;">
                ${escapeHtml(data.magicLink)}
              </p>

              <p style="margin: 0; color: #dc2626; font-size: 13px; line-height: 1.6; font-weight: 500;">
                ⏰ This link expires in ${data.hoursUntilExpiry} hours.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                This email was sent by ${escapeHtml(data.organizationName)} via AthleteMetrics.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate wellness reminder email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate wellness alert email template (for coaches)
   */
  private generateWellnessAlertTemplate(data: WellnessAlertEmailData): string {
    try {
      const sanitizedViewLink = sanitizeUrl(data.viewLink);

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wellness Alert</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">⚠️ Wellness Alert</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.coachName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                An automated wellness alert has been triggered for <strong>${escapeHtml(data.athleteName)}</strong>.
              </p>

              <!-- Alert Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 8px; color: #991b1b; font-size: 14px; font-weight: 600; text-transform: uppercase;">
                      ${escapeHtml(data.alertType)}
                    </p>
                    <p style="margin: 0; color: #7f1d1d; font-size: 15px; line-height: 1.5;">
                      ${escapeHtml(data.summary)}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                We recommend checking in with this athlete to ensure they're receiving the support they need.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizedViewLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      View Athlete Wellness Data
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 0; color: #718096; font-size: 13px; line-height: 1.6;">
                This is an automated notification based on wellness questionnaire responses. Please use your professional judgment when following up with athletes.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                AthleteMetrics - Athletic Performance & Wellness Tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate wellness alert email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate account linked notification email template
   */
  private generateAccountLinkedTemplate(data: AccountLinkedNotificationData): string {
    try {
      const orgList = data.linkedOrganizations.map(org => escapeHtml(org)).join(', ');

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accounts Linked - AthleteMetrics</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Accounts Linked</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.userName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Good news! Your AthleteMetrics account has been automatically linked to an existing global athlete profile: <strong>${escapeHtml(data.globalAthleteName)}</strong>.
              </p>

              <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                This means you can now view all your performance data from the following organizations in one unified dashboard:
              </p>

              <!-- Organizations List -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 24px; background-color: #f8fafc; border-radius: 6px;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0; color: #6366f1; font-size: 15px; font-weight: 600;">
                      ${orgList}
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                You can manage your cross-organization data sharing and privacy settings at any time from your profile.
              </p>

              <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.6;">
                If you don't recognize this activity or wish to unlink your accounts, please visit your global athlete profile settings.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                AthleteMetrics - Cross-Organization Performance Tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate account linked email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate claim verification email template
   */
  private generateClaimVerificationTemplate(data: ClaimVerificationEmailData): string {
    try {
      const sanitizedLink = sanitizeUrl(data.verificationLink);

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Email to Link Account</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Verify Email to Link Account</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi,
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                <strong>${escapeHtml(data.userName)}</strong> has requested to link this email address to their AthleteMetrics global athlete profile.
              </p>

              <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                If you own this email address and want to link your accounts, click the button below to verify:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizedLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Verify & Link Account
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #06b6d4; font-size: 14px; word-break: break-all;">
                ${escapeHtml(data.verificationLink)}
              </p>

              <p style="margin: 0 0 16px; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                This link will expire in 24 hours.
              </p>

              <p style="margin: 0; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                If you didn't request this or don't recognize the user, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                AthleteMetrics - Cross-Organization Performance Tracking
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate claim verification email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate event invitation email template
   */
  private generateEventInvitationTemplate(data: EventInvitationEmailData): string {
    try {
      const sanitizedAcceptUrl = sanitizeUrl(data.acceptUrl);
      const recipientName = data.recipientName || 'there';
      const eventDate = data.eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
      });
      const eventTime = data.eventDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC'
      });

      const expiryDays = Math.ceil((data.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Event Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">You're Invited!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(recipientName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                <strong>${escapeHtml(data.inviterName)}</strong>${data.organizationName ? ` from <strong>${escapeHtml(data.organizationName)}</strong>` : ''} has invited you to participate in:
              </p>

              <!-- Event Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <h2 style="margin: 0 0 12px; color: #1e40af; font-size: 22px; font-weight: 600;">
                      ${escapeHtml(data.eventName)}
                    </h2>
                    <p style="margin: 0 0 8px; color: #1e3a8a; font-size: 15px;">
                      <strong>📅 Date:</strong> ${eventDate}
                    </p>
                    <p style="margin: 0 0 8px; color: #1e3a8a; font-size: 15px;">
                      <strong>🕐 Time:</strong> ${eventTime}
                    </p>
                    ${data.eventLocation ? `
                    <p style="margin: 0; color: #1e3a8a; font-size: 15px;">
                      <strong>📍 Location:</strong> ${escapeHtml(data.eventLocation)}
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Click the button below to view the full event details and confirm your participation:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizedAcceptUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      View Invitation & Register
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #3b82f6; font-size: 14px; word-break: break-all;">
                ${sanitizedAcceptUrl}
              </p>

              <p style="margin: 0; color: #a0aec0; font-size: 12px; line-height: 1.6;">
                This invitation will expire in ${expiryDays} day${expiryDays !== 1 ? 's' : ''}.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                This email was sent by ${data.organizationName ? escapeHtml(data.organizationName) : 'AthleteMetrics'} via AthleteMetrics Events. If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate event invitation email template:', error);
      throw new Error('Failed to generate email template');
    }
  }

  /**
   * Generate report shared notification template
   */
  private generateReportSharedTemplate(data: ReportSharedEmailData): string {
    try {
      const sanitizedViewUrl = sanitizeUrl(data.viewUrl);

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Performance Report</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">New Performance Report</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1a202c; font-size: 22px; font-weight: 600;">
                Your coach shared a report with you
              </h2>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hi ${escapeHtml(data.athleteName)},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                <strong>${escapeHtml(data.coachName)}</strong> from <strong>${escapeHtml(data.organizationName)}</strong> has shared a performance report with you:
              </p>

              <!-- Report Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #3b82f6; border-radius: 4px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 8px; color: #1e40af; font-size: 18px; font-weight: 600;">
                      ${escapeHtml(data.reportName)}
                    </h3>
                    ${data.message ? `
                    <p style="margin: 12px 0 0; color: #1e3a8a; font-size: 15px; line-height: 1.5; font-style: italic; padding-top: 12px; border-top: 1px solid #bfdbfe;">
                      "${escapeHtml(data.message)}"
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Click the button below to view your performance report and track your progress:
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${sanitizedViewUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      View Report
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #3b82f6; font-size: 14px; word-break: break-all;">
                ${escapeHtml(sanitizedViewUrl)}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                This email was sent by ${escapeHtml(data.organizationName)} via AthleteMetrics. Your coach is tracking your progress and sharing insights to help you improve.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
      `.trim();
    } catch (error) {
      console.error('Failed to generate report shared email template:', error);
      throw new Error('Failed to generate email template');
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();
