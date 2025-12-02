/**
 * Admin utility routes - administrative tools and testing endpoints
 * Extracted from routes.ts for better maintainability
 */

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireSiteAdmin } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { generateInvitationLink, getBaseUrl } from "../utils/url-utils";
import { emailService } from "../services/email-service";
import { isValidEmail } from "@shared/email-validation";

// Rate limiting for test email endpoint
const testEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  message: { message: "Too many test email requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

// Test email request interface
interface TestEmailRequest {
  emailType: 'invitation' | 'welcome' | 'verification' | 'password-reset';
  recipientEmail: string;
}

export function registerAdminUtilityRoutes(app: Express) {
  /**
   * Fix contact data for all athletes
   * Moves emails found in phone number fields to the emails array
   */
  app.post("/api/admin/fix-contact-data", requireSiteAdmin, async (req, res) => {
    try {
      const results: any[] = [];
      const errors: any[] = [];

      // Get all users (athletes)
      const allUsers = await storage.getAthletes();

      for (const user of allUsers) {
        try {
          let hasChanges = false;
          const currentEmails = [...(user.emails || [])];
          const currentPhones = [...(user.phoneNumbers || [])];
          const newEmails: string[] = [];
          const newPhones: string[] = [];

          // Check phone numbers for emails
          currentPhones.forEach(phone => {
            if (isValidEmail(phone)) {
              // Found email in phone numbers
              if (!currentEmails.includes(phone) && !newEmails.includes(phone)) {
                newEmails.push(phone);
                hasChanges = true;
                results.push({
                  userId: user.id,
                  name: `${user.firstName} ${user.lastName}`,
                  action: `Moved email "${phone}" from phone numbers to emails`
                });
              }
            } else {
              // Keep as phone number
              newPhones.push(phone);
            }
          });

          // If we found emails in phone numbers, update the user
          if (hasChanges) {
            const updatedEmails = [...currentEmails, ...newEmails];
            await storage.updateUser(user.id, {
              emails: updatedEmails,
              phoneNumbers: newPhones
            });
          }
        } catch (error) {
          console.error(`Error processing user ${user.id}:`, error);
          errors.push({
            userId: user.id,
            name: `${user.firstName} ${user.lastName}`,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      res.json({
        message: `Contact data cleanup completed. ${results.length} changes made, ${errors.length} errors.`,
        results,
        errors,
        totalUsers: allUsers.length
      });

    } catch (error) {
      console.error('Contact data cleanup error:', error);
      res.status(500).json({ message: "Contact data cleanup failed", error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  /**
   * Send test emails (development/staging only)
   */
  app.post("/api/test/send-email", testEmailLimiter, requireSiteAdmin, async (req, res) => {
    try {
      // Only allow in development and staging environments
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({
          success: false,
          error: 'This endpoint is not available in production environments'
        });
      }

      const { emailType, recipientEmail } = req.body as TestEmailRequest;

      // Validate required parameters
      if (!emailType) {
        return res.status(400).json({
          success: false,
          error: 'emailType is required. Valid types: invitation, welcome, verification, password-reset'
        });
      }

      if (!recipientEmail) {
        return res.status(400).json({
          success: false,
          error: 'recipientEmail is required'
        });
      }

      // Validate email format
      const { isValidEmail: validateEmail } = await import('@shared/email-validation.js');
      if (!validateEmail(recipientEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid email address'
        });
      }

      // Validate email type
      const validEmailTypes = ['invitation', 'welcome', 'verification', 'password-reset'];
      if (!validEmailTypes.includes(emailType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid emailType. Must be one of: ${validEmailTypes.join(', ')}`
        });
      }

      let emailSent = false;

      // Send appropriate test email based on type
      switch (emailType) {
        case 'invitation': {
          const crypto = await import('crypto');
          const invitationToken = `test-invitation-${crypto.randomBytes(8).toString('hex')}`;
          const testInvitationData = {
            recipientName: 'Test User',
            inviterName: 'Admin User',
            organizationName: 'Test Organization',
            invitationLink: generateInvitationLink(req, invitationToken),
            expiryDays: 7,
            role: 'coach'
          };
          emailSent = await emailService.sendInvitation(recipientEmail, testInvitationData);
          break;
        }

        case 'welcome': {
          const testWelcomeData = {
            userName: 'Test User',
            organizationName: 'Test Organization',
            role: 'coach'
          };
          emailSent = await emailService.sendWelcome(recipientEmail, testWelcomeData);
          break;
        }

        case 'verification': {
          const crypto = await import('crypto');
          const verificationToken = `test-verification-${crypto.randomBytes(8).toString('hex')}`;
          const testVerificationData = {
            userName: 'Test User',
            verificationLink: `${getBaseUrl(req)}/verify-email?token=${verificationToken}`
          };
          emailSent = await emailService.sendEmailVerification(recipientEmail, testVerificationData);
          break;
        }

        case 'password-reset': {
          const crypto = await import('crypto');
          const resetToken = `test-reset-${crypto.randomBytes(8).toString('hex')}`;
          const testResetData = {
            userName: 'Test User',
            resetLink: `${getBaseUrl(req)}/reset-password?token=${resetToken}`
          };
          emailSent = await emailService.sendPasswordReset(recipientEmail, testResetData);
          break;
        }
      }

      if (emailSent) {
        res.json({
          success: true,
          message: `Test ${emailType} email sent successfully`,
          emailType,
          recipientEmail
        });
      } else {
        res.json({
          success: false,
          message: 'Email service is not configured. Email was logged to console but not sent.',
          emailType,
          note: 'Contact administrator to configure email service'
        });
      }

    } catch (error) {
      console.error('Error sending test email:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to send test email'
      });
    }
  });

  console.log("✅ Admin utility routes registered");
}
