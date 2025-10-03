/**
 * Structured logging utility for AthleteMetrics
 *
 * Provides consistent, structured logging with different levels and contexts.
 * Supports development console output and production JSON logging.
 */

import { env } from '../config/env';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export interface LogContext {
  userId?: string;
  organizationId?: string;
  teamId?: string;
  requestId?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  duration?: number;
  statusCode?: number;
  stack?: string;
  // Additional context fields - allow any serializable value
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

class Logger {
  private isDevelopment: boolean;
  private minLevel: LogLevel;

  constructor() {
    this.isDevelopment = env.NODE_ENV === 'development';
    this.minLevel = this.getMinLevel();
  }

  private getMinLevel(): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };

    // Use validated env config instead of process.env directly
    const configLevel = env.LOG_LEVEL.toLowerCase();
    return levelMap[configLevel] || LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    const levelPriority: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
    };

    return levelPriority[level] >= levelPriority[this.minLevel];
  }

  private formatForConsole(entry: LogEntry): string {
    const timestamp = new Date(entry.timestamp).toISOString();
    const levelColors: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[36m', // Cyan
      [LogLevel.INFO]: '\x1b[32m',  // Green
      [LogLevel.WARN]: '\x1b[33m',  // Yellow
      [LogLevel.ERROR]: '\x1b[31m', // Red
    };
    const resetColor = '\x1b[0m';
    const color = levelColors[entry.level];

    let output = `${color}[${entry.level.toUpperCase()}]${resetColor} ${timestamp} - ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      // Only show stack traces in development or when debug level is enabled
      if (entry.error.stack && (this.isDevelopment || this.minLevel === LogLevel.DEBUG)) {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    if (this.isDevelopment) {
      console.log(this.formatForConsole(entry));
    } else {
      // Production: JSON output for log aggregation systems
      console.log(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // HTTP request logging
  logRequest(method: string, path: string, context: LogContext): void {
    this.info(`${method} ${path}`, {
      ...context,
      method,
      path,
    });
  }

  logResponse(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    const level = statusCode >= 500 ? LogLevel.ERROR : statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    this.log(level, `${method} ${path} ${statusCode} - ${duration}ms`, {
      ...context,
      method,
      path,
      statusCode,
      duration,
    });
  }

  // Audit logging for sensitive operations
  audit(action: string, context: LogContext): void {
    this.info(`AUDIT: ${action}`, {
      ...context,
      audit: true,
    });
  }

  // Database query logging
  logQuery(query: string, duration: number, context?: LogContext): void {
    if (this.isDevelopment) {
      this.debug(`Query executed in ${duration}ms`, {
        ...context,
        query,
        duration,
      });
    }
  }

  // Security event logging
  security(event: string, context: LogContext): void {
    this.warn(`SECURITY: ${event}`, {
      ...context,
      security: true,
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const log = {
  debug: (msg: string, ctx?: LogContext) => logger.debug(msg, ctx),
  info: (msg: string, ctx?: LogContext) => logger.info(msg, ctx),
  warn: (msg: string, ctx?: LogContext, err?: Error) => logger.warn(msg, ctx, err),
  error: (msg: string, ctx?: LogContext, err?: Error) => logger.error(msg, ctx, err),
  audit: (action: string, ctx: LogContext) => logger.audit(action, ctx),
  security: (event: string, ctx: LogContext) => logger.security(event, ctx),
};
