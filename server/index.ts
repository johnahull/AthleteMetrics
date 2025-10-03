import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { env, isDevelopment } from "./config/env"; // Validate environment variables first
import { setupSessions } from "./setup-sessions";
import { registerAllRoutes } from "./routes/index";
import { setupVite, serveStatic } from "./vite";
import { logger } from "./utils/logger";
import { errorMiddleware } from "./utils/errors";
import { requestContext, sanitizeRequest } from "./middleware/index";

const app = express();

// Trust proxy when running behind a proxy (like in Replit environment)
app.set('trust proxy', 1);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request sanitization
app.use(sanitizeRequest);

// Request context and logging middleware
app.use(requestContext);

(async () => {
  // Create HTTP server
  const server = createServer(app);

  // Setup sessions (MUST BE BEFORE ROUTES)
  await setupSessions(app);

  // Register application routes
  registerAllRoutes(app);

  // Global error handling middleware (must be last)
  app.use(errorMiddleware);

  // Setup Vite in development or serve static files in production
  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
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
  const port = env.PORT;
  server.listen(port, "0.0.0.0", () => {
    logger.info(`Server started on port ${port}`, {
      environment: env.NODE_ENV,
      port,
    });
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(() => {
      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown timeout (30s in production, 10s in development)
    const shutdownTimeout = env.NODE_ENV === 'production' ? 30000 : 10000;
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, shutdownTimeout);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Log unhandled errors
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise: promise.toString() });
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', {}, error);
    process.exit(1);
  });
})();
