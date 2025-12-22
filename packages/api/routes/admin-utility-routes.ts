/**
 * Admin utility routes - administrative tools and testing endpoints
 * Extracted from routes.ts for better maintainability
 */

import type { Express } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireSiteAdmin } from "../middleware";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { generateInvitationLink, getBaseUrl } from "../utils/url-utils";
import { emailService } from "../services/email-service";
import { isValidEmail } from "@shared/email-validation";
import { RATE_LIMITS, TEST_EMAIL_WINDOW_MS } from "../constants/rate-limits";
import { DerivedMetricCalculator } from "../services/derived-metric-calculator";
import { db } from "../db";

// Rate limiting for test email endpoint
const testEmailLimiter = rateLimit({
  windowMs: TEST_EMAIL_WINDOW_MS,
  limit: RATE_LIMITS.TEST_EMAIL,
  message: { message: "Too many test email requests, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

// Rate limiting for bulk recalculation endpoint
// Prevents concurrent bulk operations that could overload the database
const bulkRecalculationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5, // Max 5 bulk recalculations per hour
  message: { error: 'Bulk recalculation rate limit exceeded. Please wait before triggering another bulk operation.' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'general'),
});

// Zod schema for test email request validation
const testEmailSchema = z.object({
  emailType: z.enum(['invitation', 'welcome', 'verification', 'password-reset']),
  recipientEmail: z.string().email('Please provide a valid email address')
});

// Type-safe interfaces for contact data results
interface ContactDataResult {
  userId: string;
  name: string;
  action: string;
}

interface ContactDataError {
  userId: string;
  name: string;
  error: string;
}

export function registerAdminUtilityRoutes(app: Express) {
  /**
   * Fix contact data for all athletes
   * Moves emails found in phone number fields to the emails array
   */
  app.post("/api/admin/fix-contact-data", requireSiteAdmin, async (req, res) => {
    try {
      const results: ContactDataResult[] = [];
      const errors: ContactDataError[] = [];

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

      // Validate request body using Zod schema
      const parseResult = testEmailSchema.safeParse(req.body);
      if (!parseResult.success) {
        const errorMessage = parseResult.error.errors[0]?.message ||
          'Invalid request. emailType must be one of: invitation, welcome, verification, password-reset';
        return res.status(400).json({
          success: false,
          error: errorMessage
        });
      }

      const { emailType, recipientEmail } = parseResult.data;
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

  /**
   * Recalculate all derived metrics
   * Used after fixing calculation logic to update existing values
   *
   * POST /api/admin/recalculate-derived-metrics
   * Query params:
   *   - organizationId: optional - only recalculate for this org
   *   - metricCode: optional - only recalculate this specific derived metric
   *   - dryRun: optional - if "true", return what would change without making changes
   *   - batchSize: optional - number of measurements per transaction batch (default: 500)
   *
   * Rate limiting: 5 requests per hour to prevent database overload
   */
  app.post("/api/admin/recalculate-derived-metrics", bulkRecalculationLimiter, requireSiteAdmin, async (req, res) => {
    try {
      const { organizationId, metricCode, dryRun, batchSize } = req.query;

      const calculator = new DerivedMetricCalculator(db);

      const result = await calculator.recalculateAllDerivedMetrics({
        organizationId: typeof organizationId === 'string' ? organizationId : undefined,
        metricCode: typeof metricCode === 'string' ? metricCode : undefined,
        dryRun: dryRun === 'true',
        batchSize: typeof batchSize === 'string' ? parseInt(batchSize, 10) : undefined,
      });

      res.json({
        success: true,
        message: dryRun === 'true'
          ? `Dry run complete. Would recalculate ${result.recalculated} of ${result.total} derived measurements.`
          : `Recalculation complete. Updated ${result.recalculated} of ${result.total} derived measurements.`,
        ...result,
      });

    } catch (error) {
      console.error('Error recalculating derived metrics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to recalculate derived metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  console.log("✅ Admin utility routes registered");
}
