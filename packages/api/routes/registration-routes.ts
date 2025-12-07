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

      const { firstName, lastName, email, username, password } = validationResult.data;

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
        // No organization membership - user is independent
      });

      const userId = user.id;

      // Create email verification token
      const { token } = await storage.createEmailVerificationToken(userId, email);

      // Send verification email
      const verificationLink = `${process.env.APP_URL}/verify-email?token=${token}`;
      const emailSent = await emailService.sendEmailVerification(email, {
        userName: firstName,
        verificationLink,
      });

      // Log registration attempt
      console.log(`[Registration] New user registered: ${username} (${email}), email sent: ${emailSent}`);

      // Audit log
      await storage.createAuditLog({
        userId,
        action: 'user_registered',
        resourceType: 'user',
        resourceId: userId,
        details: JSON.stringify({
          username,
          email,
          emailSent,
          registrationType: 'self_registration'
        }),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

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
