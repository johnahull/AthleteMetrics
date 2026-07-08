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

/**
 * Fail-secure default applied when NODE_ENV is unset. Shared with index.ts's
 * early `process.env.NODE_ENV` mutation so the two cannot drift.
 */
export const DEFAULT_NODE_ENV = 'production';

// Weak-secret detection (repeated chars/patterns and common words).
// NOTE: /^(.*)\1$/ uses a backreference that can backtrack super-linearly on
// near-repeating input. This is safe here because SESSION_SECRET comes from the
// operator's environment (not user input) and is short and bounded, so it is not
// a ReDoS vector.
const WEAK_SECRET_PATTERNS = [
  /^(.)\1+$/,           // single repeated character
  /^(..)\1+$/,          // repeated 2-char pattern
  /^(.*)\1$/,           // whole string repeated twice
  /password|secret|test|dev|admin|default|change|temp/i, // common weak words
];

const envSchema = z
  .object({
    // All environments actually used: local dev, the vitest harness ('test'),
    // Railway's testing/PR-preview env ('testing'), staging, and production.
    // Omitting a real value here would process.exit(1) that deployment at boot.
    NODE_ENV: z.enum(['development', 'test', 'testing', 'staging', 'production']).default(DEFAULT_NODE_ENV),
    // Must be a postgres connection string, not merely a non-empty string —
    // a typo'd value like "not-a-url" should fail fast at boot, not surface as
    // an opaque connection error on the first query. Accepts both the
    // `postgres://` and `postgresql://` schemes (Neon/libpq treat them alike).
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required')
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// or postgresql:// connection string'),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET must be at least 32 characters long'),
    // Optional — the app has fallbacks for these.
    ADMIN_USER: z.string().optional(),
    ADMIN_EMAIL: z.string().optional(),
    // The codebase reads the seeded admin password under two names: routes.ts
    // uses ADMIN_PASSWORD, packages/api/seed.ts uses ADMIN_PASS. Declare both so
    // the typed schema documents the real surface and neither is dropped once
    // call sites migrate to reading the validated config instead of process.env.
    ADMIN_PASSWORD: z.string().optional(),
    ADMIN_PASS: z.string().optional(),
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

let cachedEnv: Env | null = null;

/**
 * The typed, validated configuration — populated by validateEnvOrExit() at
 * startup. Call sites can read strongly-typed config here instead of reaching
 * into raw process.env. Throws if accessed before validation has run (a
 * programming error: validateEnvOrExit() is the first thing index.ts does).
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    throw new Error('getEnv() called before validateEnvOrExit() — env not yet validated');
  }
  return cachedEnv;
}

/**
 * Validate process.env at startup, printing a readable report and exiting the
 * process if configuration is invalid. Returns the typed, validated config and
 * caches it for later retrieval via getEnv().
 */
export function validateEnvOrExit(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    console.error('❌ FATAL: Invalid environment configuration:');
    const failedFields = new Set<string>();
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || '(root)';
      failedFields.add(field);
      console.error(`   - ${field}: ${issue.message}`);
    }
    // Targeted remediation hints only for the fields that actually failed.
    if (failedFields.has('SESSION_SECRET')) {
      console.error('   Generate a secure SESSION_SECRET: openssl rand -hex 64');
    }
    if (failedFields.has('DATABASE_URL')) {
      console.error('   Set DATABASE_URL to a valid PostgreSQL connection string.');
    }
    process.exit(1);
  }
  cachedEnv = result.data;
  return result.data;
}
