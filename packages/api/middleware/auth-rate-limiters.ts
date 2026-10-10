import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { RATE_LIMITS } from "../constants/rate-limits";

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MESSAGE = { message: "Too many authentication attempts, please try again later." };

/**
 * Builds the login and password-reset limiters used by routes/auth-routes.ts.
 *
 * - loginLimiter counts only FAILED logins (status >= 400) per IP, per OWASP/NIST guidance.
 *   Per-account lockout (auth/security.ts) is a separate control.
 * - forgotPasswordLimiter counts every request per IP (it sends email).
 * - resetTokenLimiter counts every request per IP for validate-reset-token and reset-password, in a bucket
 *   of its own so a reload of the reset page cannot lock a user out of requesting or completing a reset.
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

  const forgotPasswordLimiter = rateLimit({
    ...common,
    limit: RATE_LIMITS.PASSWORD_RESET_PER_IP,
  });

  const resetTokenLimiter = rateLimit({
    ...common,
    limit: RATE_LIMITS.RESET_TOKEN_REQUESTS_PER_IP,
  });

  return { loginLimiter, forgotPasswordLimiter, resetTokenLimiter };
}
