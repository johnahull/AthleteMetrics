/**
 * Process-level safety handlers.
 *
 * A single-process Node server has no supervisor thread: an unhandled promise
 * rejection or an uncaught exception that escapes all try/catch blocks can take
 * the whole server down (or, depending on Node flags, be silently swallowed).
 * These handlers make that behaviour explicit and observable.
 *
 * Policy:
 *  - unhandledRejection: log loudly but keep serving. These are frequently
 *    benign (a fire-and-forget notification that rejected) and crashing the
 *    entire multi-tenant server for one stray rejection would be worse.
 *  - uncaughtException: the process is now in an undefined state, so log and
 *    trigger the graceful-shutdown path, letting the platform restart cleanly.
 */

type LogFn = (message: string) => void;
type FatalFn = (error: unknown) => void;

export function handleUnhandledRejection(reason: unknown, log: LogFn): void {
  const detail = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
  log(`Unhandled promise rejection (process continuing): ${detail}`);
}

export function handleUncaughtException(error: unknown, log: LogFn, onFatal: FatalFn): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  log(`Uncaught exception (initiating graceful shutdown): ${detail}`);
  onFatal(error);
}

/**
 * Register the process-safety handlers. `log` receives a formatted message and
 * `onFatal` is invoked for uncaught exceptions (typically the graceful-shutdown
 * routine).
 */
export function registerProcessSafetyHandlers(deps: { log: LogFn; onFatal: FatalFn }): void {
  process.on('unhandledRejection', (reason) => handleUnhandledRejection(reason, deps.log));
  process.on('uncaughtException', (error) => handleUncaughtException(error, deps.log, deps.onFatal));
}
