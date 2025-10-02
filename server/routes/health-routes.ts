/**
 * Health Check Routes
 * Provides endpoints for monitoring application health and status
 */

import type { Express } from "express";
import { checkDatabaseHealth } from "../utils/db-helpers";

/**
 * Register health check routes
 */
export function registerHealthRoutes(app: Express) {
  /**
   * GET /api/health
   * Basic health check endpoint
   */
  app.get('/api/health', async (req, res) => {
    try {
      // Check database connectivity
      const dbHealth = await checkDatabaseHealth();

      const health = {
        status: dbHealth.healthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          unit: 'MB',
        },
        database: {
          connected: dbHealth.healthy,
          latency: dbHealth.latency,
        },
        environment: process.env.NODE_ENV || 'development',
      };

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/health/ready
   * Readiness probe for Kubernetes/orchestration
   */
  app.get('/api/health/ready', async (req, res) => {
    try {
      // Check if app is ready to accept traffic
      const dbHealth = await checkDatabaseHealth();

      if (dbHealth.healthy) {
        res.status(200).json({ ready: true });
      } else {
        res.status(503).json({ ready: false, reason: dbHealth.error || 'Database not connected' });
      }
    } catch (error) {
      res.status(503).json({
        ready: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/health/live
   * Liveness probe for Kubernetes/orchestration
   */
  app.get('/api/health/live', (req, res) => {
    // Simple check that the process is running
    res.status(200).json({ alive: true });
  });
}
