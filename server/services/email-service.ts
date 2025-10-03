/**
 * Email Service
 * Handles all email sending operations using SendGrid
 */

import sgMail from '@sendgrid/mail';

// Initialize SendGrid
const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

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

export class EmailService {
  private fromEmail: string;
  private fromName: string;
  private enabled: boolean;

  constructor() {
    this.fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@athletemetrics.com';
    this.fromName = process.env.SENDGRID_FROM_NAME || 'AthleteMetrics';
    this.enabled = !!process.env.SENDGRID_API_KEY;

    if (!this.enabled) {
      console.warn('⚠️ SendGrid API key not configured. Email sending is disabled.');
    }
  }

  /**
   * Send a raw email
   */
  private async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.enabled) {
      console.log('📧 Email sending disabled (no API key). Would have sent:', {
        to: options.to,
        subject: options.subject
      });
      return false;
    }

    try {
      await sgMail.send({
        from: {
          email: this.fromEmail,
          name: this.fromName
        },
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.stripHtml(options.html)
      });

      console.log(`✅ Email sent successfully to ${options.to}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to send email:', error);
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
   * Generate invitation email template
   */
  private generateInvitationTemplate(data: InvitationEmailData): string {
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
                Hi ${data.recipientName},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                <strong>${data.inviterName}</strong> has invited you to join <strong>${data.organizationName}</strong> on AthleteMetrics${data.role ? ` as a <strong>${data.role}</strong>` : ''}.
              </p>

              <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                AthleteMetrics helps track and analyze athletic performance data, providing valuable insights for coaches and athletes.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${data.invitationLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${data.invitationLink}
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
  }

  /**
   * Generate welcome email template
   */
  private generateWelcomeTemplate(data: WelcomeEmailData): string {
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
                Hi ${data.userName},
              </p>

              <p style="margin: 0 0 16px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Welcome to <strong>${data.organizationName}</strong> on AthleteMetrics! Your account has been successfully created.
              </p>

              <p style="margin: 0 0 24px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                You can now start tracking and analyzing performance data. Your role is: <strong>${data.role}</strong>.
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
  }

  /**
   * Generate email verification template
   */
  private generateVerificationTemplate(data: EmailVerificationData): string {
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
                Hi ${data.userName},
              </p>

              <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Please verify your email address by clicking the button below:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${data.verificationLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${data.verificationLink}
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
  }

  /**
   * Generate password reset template
   */
  private generatePasswordResetTemplate(data: PasswordResetData): string {
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
                Hi ${data.userName},
              </p>

              <p style="margin: 0 0 32px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to create a new password:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${data.resetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 32px 0 16px; color: #718096; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px; color: #667eea; font-size: 14px; word-break: break-all;">
                ${data.resetLink}
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
  }
}

// Export singleton instance
export const emailService = new EmailService();
