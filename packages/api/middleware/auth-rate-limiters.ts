import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { RATE_LIMITS } from "../constants/rate-limits";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MESSAGE = { message: "Too many authentication attempts, please try again later." };

/**
 * Builds the login and password-reset limiters.
 *
 * - loginLimiter counts only FAILED logins (status >= 400) per IP, per OWASP/NIST guidance.
 *   Per-account lockout (auth/security.ts) is a separate control.
 * - passwordResetLimiter counts every request per IP, in its own bucket.
 *
 * `skip` is injected so tests can disable the localhost/test-env bypass.
 */
export function createAuthRateLimiters({ skip }: { skip: (req: Request) => boolean }) {
  const common = {
    windowMs: WINDOW_MS,
    message: MESSAGE,
    standardHeaders: "draft-7" as const,
    legacyHeaders: false,
    skip,
  };

  const loginLimiter = rateLimit({
    ...common,
    limit: RATE_LIMITS.LOGIN_FAILURES_PER_IP,
    skipSuccessfulRequests: true,
  });

  const passwordResetLimiter = rateLimit({
    ...common,
    limit: RATE_LIMITS.PASSWORD_RESET_PER_IP,
  });

  return { loginLimiter, passwordResetLimiter };
}
