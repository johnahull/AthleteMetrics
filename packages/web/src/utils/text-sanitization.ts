/**
 * Text sanitization utilities for preventing XSS attacks
 * Especially important for canvas rendering and dynamic content
 */

/**
 * Sanitize text for safe canvas rendering
 * Removes control characters and limits length
 * @param text - Text to sanitize
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns Sanitized text safe for canvas rendering
 */
export function sanitizeCanvasText(text: string | null | undefined, maxLength: number = 100): string {
  if (!text) return '';

  return String(text)
    // Remove control characters (0x00-0x1F, 0x7F-0x9F)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    // Remove zero-width characters that could hide malicious content
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Trim whitespace
    .trim()
    // Limit length
    .slice(0, maxLength);
}

/**
 * Sanitize athlete name for display
 * More restrictive than general canvas text
 * @param name - Athlete name to sanitize
 * @returns Sanitized name
 */
export function sanitizeAthleteName(name: string | null | undefined): string {
  if (!name) return 'Unknown';

  return String(name)
    // Remove control characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    // Remove zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Only allow letters, numbers, spaces, hyphens, apostrophes
    .replace(/[^a-zA-Z0-9\s\-']/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim()
    // Limit to 50 characters
    .slice(0, 50) || 'Unknown';
}

/**
 * Sanitize team name for display
 * @param name - Team name to sanitize
 * @returns Sanitized team name
 */
export function sanitizeTeamName(name: string | null | undefined): string {
  if (!name) return 'Unknown Team';

  return String(name)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^a-zA-Z0-9\s\-'&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'Unknown Team';
}