import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./utils/logger.js";
import { shutdownSecurityStore } from "./middleware/organization-type-security";
import { shutdownAuditLogQueue } from "./middleware/organization-type-middleware";
import { startWellnessDigestJob, stopWellnessDigestJob } from "./jobs/wellness-digest-job";
import { startWellnessScheduledJob, stopWellnessScheduledJob } from "./jobs/wellness-scheduled-job";
import { startCoppaTokenCleanupJob, stopCoppaTokenCleanupJob } from "./jobs/coppa-token-cleanup";
import { registerProcessSafetyHandlers } from "./lib/process-safety";
import { validateEnvOrExit, DEFAULT_NODE_ENV } from "./config/env";

// Default NODE_ENV to production for security (fail-secure approach)
// Production mode ensures: error sanitization, rate limiting, secure cookies
// This is safer than failing or defaulting to development mode
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = DEFAULT_NODE_ENV;
  console.warn('⚠️  NODE_ENV not set, defaulting to production for security');
  console.warn('   Set NODE_ENV=development explicitly for local development');
}

// Validate all required environment configuration once, at startup. This folds
// in the SESSION_SECRET length/entropy/production rules and fails fast (with a
// readable report) on any misconfiguration. See packages/api/config/env.ts.
validateEnvOrExit();

const app = express();

// Trust proxy when running behind a proxy (like in Replit environment)
app.set('trust proxy', 1);

// PDF export routes (POST /api/reports/:id/pdf and POST /api/public/reports/:token/pdf)
// accept large chart-image payloads and mount their own higher-limit JSON parser.
// Skip the default 100kb global parser for them so it does not 413 before the
// route-level parser runs. All other routes keep the small default limit.
const defaultJsonParser = express.json();
// Only the two known PDF-export endpoints get the large route-level parser.
// Match them explicitly (prefix + `/pdf` suffix) rather than any path ending in
// `/pdf`, so a future POST route ending in `/pdf` can't silently inherit the
// 15 MB limit by skipping the 100kb default.
const isLargePdfUpload = (req: Request) =>
  req.method === 'POST' &&
  req.path.endsWith('/pdf') &&
  (req.path.startsWith('/api/reports/') || req.path.startsWith('/api/public/reports/'));
app.use((req, res, next) =>
  isLargePdfUpload(req) ? next() : defaultJsonParser(req, res, next),
);
app.use(express.urlencoded({ extended: false }));

// Cache database connection modules for performance
let dbCache: any = null;
let sqlCache: any = null;
let packageJsonCache: any = null;

async function getDbConnection() {
  if (!dbCache || !sqlCache) {
    const dbModule = await import('./db');
    const sqlModule = await import('drizzle-orm');
    dbCache = dbModule.db;
    sqlCache = sqlModule.sql;
  }
  return { db: dbCache, sql: sqlCache };
}

async function getPackageJson() {
  if (!packageJsonCache) {
    packageJsonCache = await import('../../package.json');
  }
  return packageJsonCache;
}

// Liveness probe - checks if the process is responsive (no DB check)
app.get('/api/health/liveness', async (_req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// Readiness probe - checks if ready to serve traffic (with DB check)
app.get('/api/health/readiness', async (_req, res) => {
  try {
    const { db, sql } = await getDbConnection();
    await db.execute(sql`SELECT 1`);

    const packageJson = await getPackageJson();

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      version: packageJson.version || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Log error in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      console.error('Readiness check failed:', error);
    }

    res.status(503).json({
      status: 'not_ready',
      database: 'disconnected',
      error: process.env.NODE_ENV === 'production'
        ? 'Database connection failed'
        : error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Combined health check endpoint (for backward compatibility and monitoring)
app.get('/api/health', async (_req, res) => {
  try {
    const { db, sql } = await getDbConnection();
    await db.execute(sql`SELECT 1`);

    const packageJson = await getPackageJson();

    res.status(200).json({
      status: 'healthy',
      database: 'connected',
      version: packageJson.version || 'unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Log error in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      console.error('Health check failed:', error);
    }

    // Return 503 Service Unavailable if database is down
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: process.env.NODE_ENV === 'production'
        ? 'Database connection failed'
        : error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Graceful shutdown handler - defined early so process.on can be registered immediately
let shutdownHandler: ((signal: string) => Promise<void>) | null = null;

// Register signal handlers immediately (before server starts)
process.on('SIGTERM', () => shutdownHandler?.('SIGTERM'));
process.on('SIGINT', () => shutdownHandler?.('SIGINT'));

// Register process-safety handlers: log unhandled rejections (keep serving) and
// gracefully shut down on uncaught exceptions instead of dying silently.
registerProcessSafetyHandlers({
  log: (message) => console.error(message),
  onFatal: () => {
    if (shutdownHandler) {
      shutdownHandler('uncaughtException');
    } else {
      // The crash happened during startup, before the graceful-shutdown handler
      // was wired up. Exit non-zero so the platform restarts a clean process
      // instead of leaving a half-initialized one running (health checks would
      // otherwise fail indefinitely without a restart).
      process.exit(1);
    }
  },
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    // Always log full error details server-side for debugging
    console.error(`[${status}] Application error:`, {
      message: err.message,
      stack: err.stack,
      path: _req.path,
      method: _req.method
    });

    // CRITICAL: Check if headers already sent to prevent ERR_HTTP_HEADERS_SENT
    // This can happen when async middleware/handlers throw errors after response
    if (res.headersSent) {
      // Response already sent, just log and return - don't throw in production
      if (process.env.NODE_ENV !== 'production') {
        throw err;
      }
      return;
    }

    // In production, sanitize ALL error messages to prevent information disclosure
    let message = err.message || "Internal Server Error";
    if (process.env.NODE_ENV === 'production') {
      const safeMessages: Record<number, string> = {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        422: 'Validation Error',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        503: 'Service Unavailable'
      };
      message = safeMessages[status] || 'Internal Server Error';
    }

    res.status(status).json({ message });

    // In development, also throw for easier debugging
    if (process.env.NODE_ENV !== 'production') {
      throw err;
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    try {
      const { setupVite } = await import("./vite.js");
      await setupVite(app, server);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Failed to setup Vite dev server: ${errorMsg}`, "express");
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  } else {
    try {
      const { serveStatic } = await import("./vite.js");
      serveStatic(app);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Failed to setup static file server: ${errorMsg}`, "express");
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      throw error;
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  //
  // Note: reusePort option not needed - this application runs as a single process.
  // For load balancing, use external load balancers (Nginx, cloud ALB/NLB, K8s services)
  // rather than Node.js clustering. reusePort is only useful for multiple processes
  // binding to the same port on the same machine (Linux only).
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", async () => {
    log(`serving on port ${port}`);

    // Warm up metric config cache for optimal performance
    try {
      const { db } = await import('./db');
      const { getDerivedMetricCalculator } = await import('./services/derived-metric-calculator');
      const calculator = getDerivedMetricCalculator(db);
      await calculator.warmupCache();
    } catch (error) {
      console.error('Failed to warmup metric config cache:', error);
    }

    // Start wellness digest scheduled job after server is ready (only if VAPID configured)
    try {
      const { db } = await import('./db');

      // Check if VAPID keys are configured before starting push notification job
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        startWellnessDigestJob(db);
      } else {
        console.warn('⚠️ Wellness digest job disabled - VAPID keys not configured');
      }

      // Start scheduled wellness request job (processes one-time + recurring schedules)
      startWellnessScheduledJob(db);
    } catch (error) {
      console.error('Failed to start wellness jobs:', error);
    }

    // Start COPPA consent token expiry cleanup job
    try {
      startCoppaTokenCleanupJob();
    } catch (error) {
      console.error('Failed to start COPPA token cleanup job:', error);
    }
  });

  // Assign the graceful shutdown implementation - properly close database connections on process termination
  shutdownHandler = async (signal: string) => {
    log(`${signal} received, starting graceful shutdown`);

    server.close(async () => {
      log('HTTP server closed');

      try {
        // Stop scheduled jobs
        stopWellnessDigestJob();
        stopWellnessScheduledJob();
        stopCoppaTokenCleanupJob();
        log('Scheduled jobs stopped');

        // Shutdown organization type singletons to prevent memory leaks
        shutdownSecurityStore();
        shutdownAuditLogQueue();
        log('Organization type services cleaned up');

        const { closeDatabase } = await import('./db.js');
        await closeDatabase();
        log('Database connections closed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });

    // Force exit after 30 seconds if graceful shutdown fails
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };
})();
