// drizzle-orm >=0.44 wraps driver errors in DrizzleQueryError; the original
// PostgreSQL error (carrying `.code`) is on `.cause`. Walk the full cause chain
// so both wrapped and raw driver errors are handled correctly.
export function getPgErrorCode(err: unknown): string | undefined {
  let current: any = err;
  while (current) {
    if (typeof current.code === 'string') return current.code;
    current = current.cause;
  }
  return undefined;
}

// Walk the cause chain to find the raw PostgreSQL error object, which carries
// both `.code` and `.constraint`. Needed when callers inspect `.constraint`.
export function getPgError(err: unknown): any {
  let current: any = err;
  while (current) {
    if (typeof current.code === 'string') return current;
    current = current.cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = '23505';
