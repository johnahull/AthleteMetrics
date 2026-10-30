import type { Request, Response, NextFunction } from 'express';
import { loadProfileStatus } from '../services/profile-status';

const COPPA_BLOCK_CODES: Record<string, string> = {
  pending_consent: 'coppa_pending_consent',
  needs_parent_email: 'coppa_needs_parent_email',
  consent_revoked: 'coppa_consent_revoked',
};

// Paths are relative to the /api mount (like skipCsrfPaths in routes.ts).
const ALLOWED_EXACT = new Set([
  // pre-auth and login
  '/auth/login', '/auth/logout', '/auth/register', '/auth/forgot-password', '/auth/reset-password',
  '/auth/validate-reset-token', '/auth/verify-email', '/import/photo', '/import/parse-csv',
  // current user
  '/auth/me', '/auth/me/organizations', '/admin/impersonation-status', '/admin/stop-impersonation',
  // oauth
  '/auth/google', '/auth/google/callback', '/auth/apple', '/auth/apple/callback', '/auth/oauth-status',
  // profile completion and email
  '/profile/complete', '/auth/check-email', '/auth/resend-verification',
  // links
  '/wellness/responses',
]);
const ALLOWED_PATTERNS: RegExp[] = [
  /^\/enhanced-auth\/.*/,
  /^\/auth\/link-account\/[^/]+$/,
  /^\/auth\/check-username\/[^/]+$/,
  /^\/coppa\/consent\/.*/,
  /^\/coppa\/status\/[^/]+$/,
  /^\/invitations\/[^/]+$/,
  /^\/invitations\/[^/]+\/accept$/,
  /^\/public\/.*/,
];

export function isGateAllowed(path: string): boolean {
  return ALLOWED_EXACT.has(path) || ALLOWED_PATTERNS.some((p) => p.test(path));
}

export interface GateDecision {
  missing: string[];
  coppaBlock?: { code: string; coppaStatus: string };
}

/**
 * Resolves the gate state for the session user. Only a "complete" result is cached on the session;
 * while incomplete (or consent-blocked) every call re-queries the DB.
 */
export async function resolveGateDecision(req: Request): Promise<GateDecision> {
  const user = req.session.user!;
  const cached = req.session.profileCheck;
  if (cached && cached.userId === user.id && cached.missing.length === 0) return { missing: [] };

  const status = await loadProfileStatus(user.id);
  if (!status) return { missing: [] };
  const code = COPPA_BLOCK_CODES[status.coppaStatus];
  if (code) return { missing: status.missing, coppaBlock: { code, coppaStatus: status.coppaStatus } };
  if (status.missing.length === 0) req.session.profileCheck = { userId: user.id, missing: [] };
  return { missing: status.missing };
}

export async function profileCompletionGate(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.session?.user || req.session.isImpersonating) return next();
    if (isGateAllowed(req.path)) return next();

    const decision = await resolveGateDecision(req);
    if (decision.coppaBlock) {
      return res.status(403).json({
        code: decision.coppaBlock.code,
        coppaStatus: decision.coppaBlock.coppaStatus,
        message: 'Account access requires parental consent.',
      });
    }
    if (decision.missing.length > 0) {
      return res.status(403).json({
        code: 'profile_incomplete',
        missingFields: decision.missing,
        message: 'Please complete your profile.',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
