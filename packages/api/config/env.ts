import { z } from 'zod';

/**
 * Centralized, validated environment configuration.
 *
 * `parseEnv` validates a source object (default process.env) and returns a typed
 * result, throwing a ZodError on invalid input — pure and unit-testable.
 * `validateEnvOrExit` is the startup wrapper: it prints a readable report and
 * exits the process on failure. Call it once, early, from the server entrypoint.
 *
 * The SESSION_SECRET rules mirror the previous hand-rolled checks in index.ts.
 */

// Weak-secret detection (repeated chars/patterns and common words).
const WEAK_SECRET_PATTERNS = [
  /^(.)\1+$/,           // single repeated character
  /^(..)\1+$/,          // repeated 2-char pattern
  /^(.*)\1$/,           // whole string repeated twice
  /password|secret|test|dev|admin|default|change|temp/i, // common weak words
];

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('production'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters long'),
    // Optional — the app has fallbacks for these.
    ADMIN_USER: z.string().optional(),
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
    APP_URL: z.string().optional(),
    BASE_URL: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (WEAK_SECRET_PATTERNS.some((p) => p.test(env.SESSION_SECRET))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET contains a weak pattern or common word',
      });
    }
    if (env.NODE_ENV === 'production' && env.SESSION_SECRET.length < 64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'Production SESSION_SECRET must be at least 64 characters long',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validate an environment source, throwing on invalid input. Pure — no process
 * side effects — so it can be unit-tested.
 */
export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(source);
}

/**
 * Validate process.env at startup, printing a readable report and exiting the
 * process if configuration is invalid. Returns the typed, validated config.
 */
export function validateEnvOrExit(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    console.error('❌ FATAL: Invalid environment configuration:');
    for (const issue of result.error.issues) {
      console.error(`   - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    console.error('   Generate a secure SESSION_SECRET: openssl rand -hex 64');
    process.exit(1);
  }
  return result.data;
}
