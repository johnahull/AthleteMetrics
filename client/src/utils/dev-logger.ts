/**
 * Development-only logging utility
 * Automatically disabled in production builds
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const devLog = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
  },
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  }
};