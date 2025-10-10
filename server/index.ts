import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { log } from "./utils/logger.js";

const app = express();

// Trust proxy when running behind a proxy (like in Replit environment)
app.set('trust proxy', 1);

app.use(express.json());
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
    packageJsonCache = await import('../package.json');
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

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    try {
      const { setupVite } = await import("./vite.js");
      await setupVite(app, server);
    } catch (error) {
      log("Failed to setup Vite dev server", "express");
      throw error;
    }
  } else {
    try {
      const { serveStatic } = await import("./vite.js");
      serveStatic(app);
    } catch (error) {
      log("Failed to setup static file server", "express");
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
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
