import type { Request } from 'express';

/**
 * Regenerate the session to prevent session fixation on authentication.
 *
 * The pre-authentication CSRF secret is preserved across the regeneration so a
 * CSRF token the client fetched before logging in stays valid — otherwise the
 * first state-changing request after login would fail with "Invalid session"
 * until the client refetched a token.
 */
export async function regenerateSession(req: Request): Promise<void> {
  const csrfSecret = (req.session as any)?.csrfSecret;
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
  if (csrfSecret) {
    (req.session as any).csrfSecret = csrfSecret;
  }
}

/**
 * Persist the session to the store before responding, so the Set-Cookie header
 * for the newly regenerated session is written before the response body. Without
 * this, express-session's lazy save can race with res.json()/res.redirect() and
 * the client's next request may be treated as unauthenticated.
 */
export async function saveSession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}
