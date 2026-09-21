/**
 * Extract a structured `{message, field}` from an apiRequest error.
 * apiRequest throws `Error("<status>: <raw body>")`. The body for
 * PairedInputValidationError is `{"message":"...","field":"..."}`. Returns
 * null if the body isn't a recognizable structured error.
 *
 * Shared by measurement-form.tsx and athlete-measurement-form.tsx so both
 * paired-input entry forms surface server validation errors on the same
 * field the same way.
 */
export function parseFieldError(
  error: Error,
): { message: string; field: 'primaryValue' | 'auxiliaryValue' | 'formula' } | null {
  if (!error?.message) return null;
  const stripped = error.message.replace(/^\d+:\s*/, '');
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && typeof parsed.message === 'string' && typeof parsed.field === 'string') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}
