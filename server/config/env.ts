/**
 * Environment Configuration Validation
 * Validates all required environment variables at application startup
 * Provides type-safe access to environment variables throughout the application
 */

import { z } from "zod";

const envSchema = z.object({
  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  PORT: z.coerce.number().int().positive().default(5000),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Authentication
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters for security"),
  ADMIN_USER: z.string().min(3, "ADMIN_USER must be at least 3 characters"),
  ADMIN_PASS: z.string().min(12, "ADMIN_PASS must be at least 12 characters for security"),

  // Analytics Rate Limiting
  ANALYTICS_RATE_WINDOW_MS: z.coerce.number().int().positive().default(900000), // 15 minutes
  ANALYTICS_RATE_LIMIT: z.coerce.number().int().positive().default(50),
  ANALYTICS_RATE_LIMIT_MESSAGE: z.string().default("Too many analytics requests, please try again later."),

  // General Rate Limiting Bypass (Development Only)
  BYPASS_ANALYTICS_RATE_LIMIT: z.coerce.boolean().default(false),
  BYPASS_GENERAL_RATE_LIMIT: z.coerce.boolean().default(false),

  // Optional Services
  SENDGRID_API_KEY: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// Parse and validate environment variables
function validateEnv() {
  try {
    const parsed = envSchema.parse(process.env);

    // Additional security checks for production
    if (parsed.NODE_ENV === 'production') {
      // Disable rate limit bypasses in production
      if (parsed.BYPASS_ANALYTICS_RATE_LIMIT || parsed.BYPASS_GENERAL_RATE_LIMIT) {
        console.warn('WARNING: Rate limit bypasses are automatically disabled in production');
        parsed.BYPASS_ANALYTICS_RATE_LIMIT = false;
        parsed.BYPASS_GENERAL_RATE_LIMIT = false;
      }

      // Ensure strong session secret in production - FAIL instead of warn
      if (parsed.SESSION_SECRET.length < 64) {
        throw new Error('FATAL: SESSION_SECRET must be at least 64 characters in production. Current length: ' + parsed.SESSION_SECRET.length);
      }

      // Fail on default or weak admin credentials in production
      if (parsed.ADMIN_USER === 'admin') {
        throw new Error('FATAL: Default admin username "admin" is not allowed in production. Please use a unique admin username.');
      }

      if (parsed.ADMIN_PASS.length < 20) {
        throw new Error('FATAL: ADMIN_PASS must be at least 20 characters in production for security. Current length: ' + parsed.ADMIN_PASS.length);
      }
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment variable validation failed:');
      console.error('');

      error.errors.forEach((err) => {
        const path = err.path.join('.');
        console.error(`  • ${path}: ${err.message}`);
      });

      console.error('');
      console.error('Please check your .env file and ensure all required variables are set correctly.');
      console.error('See .env.example for reference.');

      process.exit(1);
    }

    throw error;
  }
}

// Export validated environment configuration
export const env = validateEnv();

// Export types for TypeScript
export type Env = z.infer<typeof envSchema>;

// Helper to check if running in production
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

// Log successful validation
if (isDevelopment) {
  console.log('✅ Environment variables validated successfully');
}
