/**
 * Registration routes - handles public user self-registration
 * Users can sign up without an invitation and become "Independent Athletes"
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storage } from "../storage";
import { shouldSkipRateLimiting } from "../utils/rate-limit-utils";
import { emailService } from "../services/email-service";
import {
  validateLegalAcceptanceTimestamp,
  getLegalAcceptanceTimestamp,
  INVALID_TIMESTAMP_MESSAGE,
  MISSING_ACCEPTANCE_MESSAGE,
  AUDIT_ACTION_LEGAL_ACCEPTED
} from "@shared/legal-acceptance";
import { coppaService } from "../services/coppa-service";
import { consumeRegistrationToken } from "../services/registration-token-store";
import { isUnder13, isMinorAge, isTeenMinor } from "@shared/coppa-utils";
import { db } from "../db";
import { parentalConsents, parentAthleteLinks } from "@shared/schema/tables/coppa";
import { eq } from "drizzle-orm";

// Rate limiting for registration endpoints (stricter than normal auth)
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 registration attempts per 15 minutes
  message: { message: "Too many registration attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

// Rate limiting for availability check endpoints (prevent enumeration attacks)
const availabilityCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 checks per 15 minutes (reasonable for legitimate use)
  message: { message: "Too many availability checks, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => shouldSkipRateLimiting(req, 'auth'),
});

// Validation schema for registration
const registrationSchema = z.object({
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be 50 characters or less")
    .trim(),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be 50 characters or less")
    .trim(),
  email: z.string()
    .email("Invalid email address")
    .max(255, "Email must be 255 characters or less")
    .toLowerCase()
    .trim(),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be 128 characters or less")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character"),
  legalAcceptedAt: z.string()
    .min(1, MISSING_ACCEPTANCE_MESSAGE)
    .refine(
      (val) => validateLegalAcceptanceTimestamp(val),
      INVALID_TIMESTAMP_MESSAGE
    ),
  // COPPA fields — birthDate is required for all registrations to enforce age checks
  birthDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate must be in YYYY-MM-DD format"),
  parentEmail: z.string()
    .email("Parent email must be a valid email address")
    .max(255)
    .toLowerCase()
    .trim()
    .optional(),
}).superRefine((data, ctx) => {
  let under13 = false;
  let teenMinor = false;
  try {
    under13 = isUnder13(data.birthDate);
    teenMinor = isTeenMinor(data.birthDate);
  } catch { /* invalid date format handled by regex above */ }

  // parentEmail must differ from athlete email whenever it is provided
  // (applies to both under-13 and 13-17 paths)
  if (data.parentEmail && data.parentEmail === data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parentEmail'],
      message: "Parent email must be different from the athlete's email.",
    });
  }

  // Under-13: parentEmail is required
  if (under13 && !data.parentEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['parentEmail'],
      message: "Parent or guardian email is required for athletes under 13.",
    });
  }
});

// Validation schema for parent registration
const parentRegistrationSchema = z.object({
  firstName: z.string()
    .min(1, "First name is required")
    .max(50, "First name must be 50 characters or less")
    .trim(),
  lastName: z.string()
    .min(1, "Last name is required")
    .max(50, "Last name must be 50 characters or less")
    .trim(),
  email: z.string()
    .email("Invalid email address")
    .max(255, "Email must be 255 characters or less")
    .toLowerCase()
    .trim(),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or less")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .toLowerCase()
    .trim(),
  password: z.string()
    .min(12, "Password must be at least 12 characters")
    .max(128, "Password must be 128 characters or less")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character"),
  legalAcceptedAt: z.string()
    .min(1, MISSING_ACCEPTANCE_MESSAGE)
    .refine(
      (val) => validateLegalAcceptanceTimestamp(val),
      INVALID_TIMESTAMP_MESSAGE
    ),
  // consentId links this registration to a pre-existing VPC consent record
  consentId: z.string().optional(),
  // Opaque single-use token minted at consent-grant time, resolving server-side
  // to { consentId, parentEmail } — replaces passing consentId/email via the
  // /register URL. Takes precedence over a client-supplied consentId.
  ref: z.string().optional(),
});

// Validation schema for resend verification
const resendVerificationSchema = z.object({
  email: z.string()
    .email("Invalid email address")
    .toLowerCase()
    .trim(),
});

export function registerRegistrationRoutes(app: Express) {
  /**
   * Register a new user account
   * Creates user as "independent athlete" with no organization
   * Requires email verification before login
   */
  app.post("/api/auth/register", registrationLimiter, async (req: Request, res: Response) => {
    try {
      // Validate input
      const validationResult = registrationSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors
        });
      }

      const { firstName, lastName, email, username, password, legalAcceptedAt, birthDate, parentEmail } = validationResult.data;

      // Determine age classification before creating the user
      // birthDate is guaranteed by the Zod schema (required field)
      let under13 = false;
      let minor = false;
      let teenMinor = false;
      try {
        under13 = isUnder13(birthDate);
        minor = isMinorAge(birthDate);
        teenMinor = isTeenMinor(birthDate);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid birthDate provided.",
          errors: [{ field: 'birthDate', message: 'Invalid date format or future date.' }],
        });
      }

      // Server-side COPPA guard (defense-in-depth beyond Zod validation)
      if (under13 && !parentEmail) {
        return res.status(400).json({
          success: false,
          message: "Parent email required for athletes under 13.",
          errors: [{ field: 'parentEmail', message: 'Parent or guardian email is required for athletes under 13.' }],
        });
      }

      // Check if username is already taken
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({
          success: false,
          message: "Username is already taken",
          field: "username"
        });
      }

      // Check if email is already registered
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists",
          field: "email"
        });
      }

      // Generate legal accepted version (YYYY-MM-DD format)
      const legalAcceptedVersion = getLegalAcceptanceTimestamp();
      const legalAcceptedAtDate = new Date(legalAcceptedAt);

      // Create user with isEmailVerified: false
      // User is created as an "independent athlete" with no organization
      // Note: storage.createUser handles password hashing internally
      const user = await storage.createUser({
        username,
        firstName,
        lastName,
        emails: [email],
        password, // Will be hashed by storage.createUser
        role: 'athlete', // Self-registered users are independent athletes
        isEmailVerified: false,
        isSiteAdmin: false,
        legalAcceptedAt: legalAcceptedAtDate,
        legalAcceptedVersion,
        birthDate: birthDate ?? undefined,
        // COPPA: set initial status — pending_consent only for under-13; teen minors use not_applicable
        coppaStatus: under13 ? 'pending_consent' : 'not_applicable',
        isMinor: minor,
        parentEmail: minor ? (parentEmail ?? undefined) : undefined,
        // No organization membership - user is independent
      });

      const userId = user.id;

      // Create email verification token
      const { token: verificationToken } = await storage.createEmailVerificationToken(userId, email);

      // Create audit logs (critical for compliance)
      // If audit logs fail, rollback by deleting the user
      const auditLogBase = {
        userId,
        resourceType: 'user' as const,
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      try {
        await storage.createAuditLog({
          ...auditLogBase,
          action: 'user_registered',
          details: JSON.stringify({
            username,
            email,
            registrationType: 'self_registration'
          }),
        });

        await storage.createAuditLog({
          ...auditLogBase,
          action: AUDIT_ACTION_LEGAL_ACCEPTED,
          details: JSON.stringify({
            version: legalAcceptedVersion,
            acceptedAt: legalAcceptedAt,
            method: 'registration'
          }),
        });
      } catch (auditError) {
        console.error('[CRITICAL] Failed to create audit logs:', auditError);
        // Rollback user creation for compliance
        try {
          await storage.deleteUser(userId);
        } catch (cleanupError) {
          console.error('[CRITICAL] Failed to cleanup user after audit log failure:', cleanupError);
        }
        return res.status(500).json({
          success: false,
          message: "Registration failed due to system error. Please try again."
        });
      }

      // COPPA branch: under-13 athletes cannot receive a session.
      // Initiate VPC flow and return early — NO session cookie set.
      if (under13 && parentEmail) {
        const coppaResult = await coppaService.initiateConsent({
          athleteUserId: userId,
          parentEmail,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });

        console.log(`[Registration] Minor registered: ${username}, VPC initiated: ${coppaResult.success}, emailSent: ${coppaResult.emailSent}`);

        const consentMessage = coppaResult.emailSent === false
          ? "Your account has been created. We were unable to send the consent email to your parent. Please ask them to visit the consent page directly, or try again later."
          : "Your account has been created. A consent email has been sent to your parent or guardian. You'll be able to log in once they approve your account.";

        return res.status(201).json({
          success: true,
          requiresParentalConsent: true,
          message: consentMessage,
        });
      }

      // Teen minor branch (13-17): normal registration with session, but also
      // create a parentAthleteLinks row and send a notification email if a
      // parentEmail was provided. Does NOT trigger COPPA VPC flow.
      if (teenMinor && parentEmail) {
        await db.insert(parentAthleteLinks).values({
          parentEmail,
          athleteUserId: userId,
          isActive: true,
        });

        // Fire-and-forget — do not block registration on email delivery
        emailService.sendParentNotification({
          parentEmail,
          athleteFirstName: firstName,
        }).catch((err: unknown) => {
          console.error('[MINOR] Failed to send parent notification email:', err);
        });
      }

      // Establish a session for the newly registered user.
      // Unlike the under-13 COPPA path (which returns early above without a session),
      // all other users — including teen minors (13-17) — can log in immediately.
      // Guard against missing session middleware (e.g. in unit test environments).
      if (req.session) {
        req.session.user = {
          id: userId,
          username,
          email,
          firstName,
          lastName,
          role: 'athlete',
          isSiteAdmin: false,
          athleteId: userId,
        };

        // Explicitly save the session so the Set-Cookie header is written
        // before the response body is sent. Without this, express-session's
        // lazy save may race with res.json() in test environments.
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Send verification email (outside transaction - email failure shouldn't rollback registration)
      const verificationLink = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
      const emailSent = await emailService.sendEmailVerification(email, {
        userName: firstName,
        verificationLink,
      });

      // Log registration attempt
      console.log(`[Registration] New user registered: ${username} (${email}), email sent: ${emailSent}`);

      return res.status(201).json({
        success: true,
        message: "Account created successfully. Please check your email to verify your account.",
        emailSent,
      });

    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({
        success: false,
        message: "Registration failed. Please try again later."
      });
    }
  });

  /**
   * Register a parent/guardian account
   *
   * Creates a user with role 'parent' and no organization membership.
   * If a consentId is provided, validates the consent record belongs to the
   * same parentEmail and then calls linkParentAccount() to upgrade the
   * email-only parentAthleteLinks rows to a full FK reference.
   *
   * Security invariants:
   * - consentId is validated server-side (parentEmail must match the consent record)
   * - No session is set — parent must verify email before logging in
   * - Rate limited at same rate as athlete registration (5/15 min)
   */
  app.post("/api/auth/register/parent", registrationLimiter, async (req: Request, res: Response) => {
    try {
      const validationResult = parentRegistrationSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errors = validationResult.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ success: false, message: "Validation failed", errors });
      }

      const { firstName, lastName, email, username, password, legalAcceptedAt, ref } = validationResult.data;
      let consentId = validationResult.data.consentId;

      // Resolve the opaque post-consent registration token (if present) to the
      // consentId it was minted for. Takes precedence over a raw consentId —
      // the ref token is what the web UI now sends instead.
      if (ref) {
        const resolved = consumeRegistrationToken(ref);
        if (!resolved) {
          return res.status(400).json({
            success: false,
            message: "This registration link has expired or already been used.",
            errors: [{ field: 'ref', message: 'Invalid or expired registration link.' }],
          });
        }
        consentId = resolved.consentId;
      }

      // Check username uniqueness
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(409).json({ success: false, message: "Username is already taken", field: "username" });
      }

      // Check email uniqueness
      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ success: false, message: "An account with this email already exists", field: "email" });
      }

      // Invitation-only gate: parent registration requires either a valid consentId
      // or an existing parentAthleteLinks row for this email (created during teen minor
      // registration or coach invitation). Prevents orphaned parent accounts.
      if (!consentId) {
        const existingLinks = await db.select({ id: parentAthleteLinks.id })
          .from(parentAthleteLinks)
          .where(eq(parentAthleteLinks.parentEmail, email.toLowerCase()))
          .limit(1);

        if (existingLinks.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Parent registration requires a valid invitation or consent link. Please use the link from your email.",
            code: "NO_PARENT_CONTEXT",
          });
        }
      }

      // If consentId provided, validate it belongs to this parent email and is still pending
      if (consentId) {
        const [consent] = await db.select({
          id: parentalConsents.id,
          parentEmail: parentalConsents.parentEmail,
          status: parentalConsents.status,
        })
          .from(parentalConsents)
          .where(eq(parentalConsents.id, consentId))
          .limit(1);

        if (!consent) {
          return res.status(400).json({
            success: false,
            message: "Invalid consent ID",
            errors: [{ field: 'consentId', message: 'Consent record not found.' }],
          });
        }

        // Validate email matches the consent record
        if (consent.parentEmail.toLowerCase() !== email.toLowerCase()) {
          return res.status(400).json({
            success: false,
            message: "Email does not match consent record",
            errors: [{ field: 'email', message: 'The email you entered does not match the consent record.' }],
          });
        }

        // Validate consent is still valid — reject revoked or expired consents.
        // A parent who denied consent (revoked) or whose token expired must not be
        // able to register and gain access to the child's data via an old consentId.
        if (!['pending', 'confirmed'].includes(consent.status)) {
          return res.status(400).json({
            success: false,
            message: "This consent link is no longer valid.",
            errors: [{ field: 'consentId', message: 'Consent was denied or has expired. Please contact the athlete\'s organization to re-initiate consent.' }],
          });
        }
      }

      const legalAcceptedVersion = getLegalAcceptanceTimestamp();
      const legalAcceptedAtDate = new Date(legalAcceptedAt);

      // Create parent user account — no org membership, role 'parent'
      const user = await storage.createUser({
        username,
        firstName,
        lastName,
        emails: [email],
        password,
        role: 'parent',
        isEmailVerified: false,
        isSiteAdmin: false,
        legalAcceptedAt: legalAcceptedAtDate,
        legalAcceptedVersion,
        coppaStatus: 'not_applicable',
        isMinor: false,
      });

      const userId = user.id;

      // Create audit logs
      const auditLogBase = {
        userId,
        resourceType: 'user' as const,
        resourceId: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      };

      try {
        await storage.createAuditLog({
          ...auditLogBase,
          action: 'user_registered',
          details: JSON.stringify({ username, email, registrationType: 'parent_registration' }),
        });

        await storage.createAuditLog({
          ...auditLogBase,
          action: AUDIT_ACTION_LEGAL_ACCEPTED,
          details: JSON.stringify({ version: legalAcceptedVersion, acceptedAt: legalAcceptedAt, method: 'registration' }),
        });
      } catch (auditError) {
        console.error('[CRITICAL] Parent registration — failed to create audit logs:', auditError);
        try {
          await storage.deleteUser(userId);
        } catch (cleanupError) {
          console.error('[CRITICAL] Failed to cleanup parent user after audit log failure:', cleanupError);
        }
        return res.status(500).json({ success: false, message: "Registration failed due to system error. Please try again." });
      }

      // Link parent account to existing parentAthleteLinks rows (upgrade email → FK)
      const linkedCount = await coppaService.linkParentAccount(userId, email);
      if (linkedCount > 0) {
        console.log(`[ParentRegistration] Linked ${linkedCount} athlete(s) to parent ${username}${consentId ? ' via consentId' : ' by email'}`);
      }

      // Send email verification
      const { token: verificationToken } = await storage.createEmailVerificationToken(userId, email);
      const verificationLink = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
      const emailSent = await emailService.sendEmailVerification(email, {
        userName: firstName,
        verificationLink,
      });

      console.log(`[ParentRegistration] Parent registered: ${username} (${email}), linkedAthletes: ${linkedCount}, emailSent: ${emailSent}`);

      return res.status(201).json({
        success: true,
        message: "Parent account created. Please check your email to verify your account.",
        linkedAthletes: linkedCount,
        emailSent,
      });

    } catch (error) {
      console.error("[ParentRegistration] Error:", error);
      return res.status(500).json({ success: false, message: "Registration failed. Please try again later." });
    }
  });

  /**
   * Resend verification email
   * For users who didn't receive or lost their verification email
   */
  app.post("/api/auth/resend-verification", registrationLimiter, async (req: Request, res: Response) => {
    try {
      // Validate input
      const validationResult = resendVerificationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid email address"
        });
      }

      const { email } = validationResult.data;

      // Find user by email
      const user = await storage.getUserByEmail(email);

      // Always return success to prevent email enumeration
      // But only send email if user exists and is not verified
      if (user && user.isEmailVerified === false) {
        // Create new verification token
        const { token } = await storage.createEmailVerificationToken(user.id, email);

        // Send verification email
        const verificationLink = `${process.env.APP_URL}/verify-email?token=${token}`;
        await emailService.sendEmailVerification(email, {
          userName: user.firstName,
          verificationLink,
        });

        console.log(`[Registration] Verification email resent to: ${email}`);
      } else if (user && user.isEmailVerified === true) {
        // User is already verified - don't reveal this to prevent enumeration
        console.log(`[Registration] Resend requested for already verified user: ${email}`);
      } else {
        // User doesn't exist - don't reveal this to prevent enumeration
        console.log(`[Registration] Resend requested for non-existent user: ${email}`);
      }

      // Always return success to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email and is not yet verified, a verification email has been sent."
      });

    } catch (error) {
      console.error("Resend verification error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to resend verification email. Please try again later."
      });
    }
  });

  /**
   * Check username availability
   * Used for real-time validation in the registration form
   */
  app.get("/api/auth/check-username/:username", availabilityCheckLimiter, async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      // Basic validation
      if (!username || username.length < 3 || username.length > 30) {
        return res.json({ available: false, message: "Invalid username" });
      }

      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.json({ available: false, message: "Username can only contain letters, numbers, and underscores" });
      }

      const existingUser = await storage.getUserByUsername(username.toLowerCase());

      return res.json({
        available: !existingUser,
        message: existingUser ? "Username is already taken" : "Username is available"
      });

    } catch (error) {
      console.error("Check username error:", error);
      return res.status(500).json({
        available: false,
        message: "Unable to check username availability"
      });
    }
  });

  /**
   * Check email availability
   * Used for real-time validation in the registration form
   */
  app.get("/api/auth/check-email", availabilityCheckLimiter, async (req: Request, res: Response) => {
    try {
      const email = (req.query.email as string)?.toLowerCase()?.trim();

      if (!email || !z.string().email().safeParse(email).success) {
        return res.json({ available: false, message: "Invalid email address" });
      }

      const existingUser = await storage.getUserByEmail(email);

      return res.json({
        available: !existingUser,
        message: existingUser ? "An account with this email already exists" : "Email is available"
      });

    } catch (error) {
      console.error("Check email error:", error);
      return res.status(500).json({
        available: false,
        message: "Unable to check email availability"
      });
    }
  });
}
