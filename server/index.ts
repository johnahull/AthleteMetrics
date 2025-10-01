import express, { type Request, Response, NextFunction } from "express";
import { env, isDevelopment } from "./config/env"; // Validate environment variables first
import { registerRoutes } from "./routes";
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
  // Register application routes
  const server = await registerRoutes(app);

  // Global error handling middleware (must be last)
  app.use(errorMiddleware);

  // Setup Vite in development or serve static files in production
  if (isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Start server
  const port = env.PORT;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
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

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
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
