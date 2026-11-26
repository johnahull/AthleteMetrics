import bcrypt from "bcrypt";
import { INVITATION_PENDING_PASSWORD } from "@shared/schema";

/**
 * Check a submitted password against a user's stored password.
 *
 * An account whose password has not been set yet stores INVITATION_PENDING_PASSWORD (older rows hold a
 * bcrypt hash of it), so the placeholder is never accepted as a password and never verifies.
 */
export async function verifyUserPassword(submitted: string, stored: string | null | undefined): Promise<boolean> {
  if (typeof submitted !== "string" || typeof stored !== "string" || !submitted || !stored) return false;
  if (submitted === INVITATION_PENDING_PASSWORD || stored === INVITATION_PENDING_PASSWORD) return false;
  return bcrypt.compare(submitted, stored);
}

/** True when the stored password means "not set yet": the placeholder, or a hash of it (older rows). */
export async function isPasswordPending(stored: string | null | undefined): Promise<boolean> {
  if (typeof stored !== "string" || !stored) return false;
  if (stored === INVITATION_PENDING_PASSWORD) return true;
  return bcrypt.compare(INVITATION_PENDING_PASSWORD, stored);
}
