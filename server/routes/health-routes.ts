/**
 * Health Check Routes
 * Provides endpoints for monitoring application health and status
 */

import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * GET /api/health
 * Basic health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    const dbHealthy = await checkDatabaseHealth();

    const health = {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB',
      },
      database: {
        connected: dbHealthy,
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
router.get('/health/ready', async (req, res) => {
  try {
    // Check if app is ready to accept traffic
    const dbHealthy = await checkDatabaseHealth();

    if (dbHealthy) {
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false, reason: 'Database not connected' });
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
router.get('/health/live', (req, res) => {
  // Simple check that the process is running
  res.status(200).json({ alive: true });
});

/**
 * Check database health
 */
async function checkDatabaseHealth(): Promise<boolean> {
  try {
    // Simple query to check database connectivity
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export default router;
