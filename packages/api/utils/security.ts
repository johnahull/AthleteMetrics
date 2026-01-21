/**
 * Security utilities for AthleteMetrics
 * OWASP A02:2021 - Cryptographic Failures Prevention
 */

import crypto from 'crypto';

/**
 * Timing-safe token comparison to prevent timing attacks
 *
 * Uses Node.js's crypto.timingSafeEqual() for constant-time comparison.
 * This prevents attackers from using timing analysis to discover valid tokens.
 *
 * @param tokenA - First token to compare
 * @param tokenB - Second token to compare
 * @returns true if tokens match, false otherwise
 *
 * @example
 * const isValid = timingSafeTokenCompare(userToken, storedToken);
 * if (!isValid) {
 *   throw new Error('Invalid token');
 * }
 */
export function timingSafeTokenCompare(tokenA: string, tokenB: string): boolean {
  // Validate inputs are strings
  if (typeof tokenA !== 'string' || typeof tokenB !== 'string') {
    return false;
  }

  // Early return if lengths differ (safe to check length)
  if (tokenA.length !== tokenB.length) {
    return false;
  }

  // Validate hex format (64 characters for 32-byte tokens)
  if (!/^[a-f0-9]{64}$/i.test(tokenA) || !/^[a-f0-9]{64}$/i.test(tokenB)) {
    return false;
  }

  try {
    // Convert hex strings to buffers for timing-safe comparison
    const bufferA = Buffer.from(tokenA, 'hex');
    const bufferB = Buffer.from(tokenB, 'hex');

    // Use crypto.timingSafeEqual for constant-time comparison
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch (error) {
    // If buffer conversion fails, tokens are invalid
    return false;
  }
}
