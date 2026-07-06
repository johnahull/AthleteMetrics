import { describe, it, expect, vi } from 'vitest';
import {
  handleUnhandledRejection,
  handleUncaughtException,
} from '../process-safety';

describe('process safety handlers', () => {
  it('logs an unhandled rejection and keeps the process running', () => {
    const log = vi.fn();
    handleUnhandledRejection(new Error('boom'), log);
    expect(log).toHaveBeenCalled();
  });

  it('logs an uncaught exception and triggers graceful shutdown', () => {
    const log = vi.fn();
    const onFatal = vi.fn();
    const err = new Error('fatal');

    handleUncaughtException(err, log, onFatal);

    expect(log).toHaveBeenCalled();
    expect(onFatal).toHaveBeenCalledWith(err);
  });
});
