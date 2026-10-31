import type { Request, Response, NextFunction } from 'express';
import { loadProfileStatus } from '../services/profile-status';

const COPPA_BLOCK_CODES: Record<string, string> = {
  pending_consent: 'coppa_pending_consent',
  needs_parent_email: 'coppa_needs_parent_email',
  consent_revoked: 'coppa_consent_revoked',
};

// Paths are relative to the /api mount (like skipCsrfPaths in routes.ts).
type Rule = { method?: string; test: (path: string) => boolean };
const exact = (path: string, method?: string): Rule => ({ method, test: (p) => p === path });
const re = (pattern: RegExp, method?: string): Rule => ({ method, test: (p) => pattern.test(p) });

// Exempt from BOTH checks: login/logout, the current user, consent flows, the completion endpoint, pre-auth endpoints.
const CONSENT_EXEMPT: Rule[] = [
  exact('/auth/login'), exact('/auth/logout'), exact('/auth/register'), exact('/auth/forgot-password'),
  exact('/auth/reset-password'), exact('/auth/validate-reset-token'), exact('/auth/verify-email'),
  exact('/auth/oauth-status'), re(/^\/auth\/check-username\/[^/]+$/),
  exact('/auth/me'),
  exact('/admin/impersonation-status'), exact('/admin/stop-impersonation'),
  exact('/auth/google'), exact('/auth/google/callback'), exact('/auth/apple'), exact('/auth/apple/callback'),
  re(/^\/auth\/link-account\/[^/]+$/),
  re(/^\/coppa\/consent\/.*/), re(/^\/coppa\/status\/[^/]+$/),
  exact('/profile/complete'),
  ...['login', 'logout', 'forgot-password', 'validate-reset-token', 'reset-password', 'verify-email'].map((n) => exact(`/enhanced-auth/${n}`)),
];
// Additionally allowed while the profile is incomplete (but still subject to the consent block).
const INCOMPLETE_ALLOWED: Rule[] = [
  ...CONSENT_EXEMPT,
  exact('/auth/me/organizations'), exact('/users/check-username'),
  exact('/auth/check-email'), exact('/auth/resend-verification'), exact('/enhanced-auth/request-email-verification'),
  re(/^\/invitations\/(?!athletes$)[^/]+$/, 'GET'),
  re(/^\/invitations\/[^/]+\/accept$/, 'POST'),
  re(/^\/public\/.*/),
];

const matches = (rules: Rule[], method: string, path: string) =>
  rules.some((r) => (!r.method || r.method === method) && r.test(path));

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
  if (status.missing.length === 0 && status.cacheable) req.session.profileCheck = { userId: user.id, missing: [] };
  return { missing: status.missing };
}

export async function profileCompletionGate(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.session?.user || req.session.isImpersonating) return next();
    if (matches(CONSENT_EXEMPT, req.method, req.path)) return next();

    // The consent block comes first: no allowlist entry (other than the exempt list) lets a blocked minor through.
    const decision = await resolveGateDecision(req);
    if (decision.coppaBlock) {
      return res.status(403).json({
        code: decision.coppaBlock.code,
        coppaStatus: decision.coppaBlock.coppaStatus,
        message: 'Account access requires parental consent.',
      });
    }
    if (decision.missing.length > 0 && !matches(INCOMPLETE_ALLOWED, req.method, req.path)) {
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
