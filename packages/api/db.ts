import * as schema from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import pkg from 'pg';
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = process.env.DATABASE_URL;

// PostgreSQL configuration with connection pooling
const isProduction = process.env.NODE_ENV === 'production';

// Neon PostgreSQL tier configuration
// Set NEON_TIER environment variable to match your Neon plan
// This prevents connection exhaustion and optimizes costs
const NEON_TIER = (process.env.NEON_TIER || 'pro').toLowerCase();

// Connection pool configurations per Neon tier
// See: https://neon.tech/docs/connect/connection-pooling
interface PoolConfig {
  max: number;
  idle_timeout: number;
  max_lifetime: number;
}

const POOL_CONFIGS: Record<string, PoolConfig> = {
  free: {
    max: 1, // Free tier: 1 connection limit
    idle_timeout: 20, // Short timeout to free resources quickly
    max_lifetime: 60 * 10, // 10 minutes
  },
  pro: {
    max: 20, // Pro tier: Up to 20 connections
    idle_timeout: 180, // 3 minutes - balances reuse with cost
    max_lifetime: 60 * 20, // 20 minutes - optimizes for cost
  },
  scale: {
    max: 50, // Scale tier: Up to 100+ connections (conservative default)
    idle_timeout: 300, // 5 minutes - longer reuse for high traffic
    max_lifetime: 60 * 30, // 30 minutes
  },
};

// Get pool configuration for current tier (default to 'pro' if invalid)
const poolConfig = POOL_CONFIGS[NEON_TIER] || POOL_CONFIGS.pro;

// Development uses smaller pool
const finalPoolConfig = isProduction
  ? poolConfig
  : { max: 5, idle_timeout: 20, max_lifetime: 60 * 10 };

const client = postgres(DATABASE_URL, {
  // Connection pool size - Tier-aware configuration
  max: finalPoolConfig.max,

  // Idle timeout: Balances connection reuse with resource costs
  // - Free tier: 20s (minimize costs)
  // - Pro tier: 180s (40-60% less churn for bursty traffic)
  // - Scale tier: 300s (optimize for high sustained traffic)
  // Typical user flow: load data → review 1-2 min → next request (connection still alive)
  idle_timeout: finalPoolConfig.idle_timeout,

  connect_timeout: 10, // Seconds to wait for connection
  max_lifetime: finalPoolConfig.max_lifetime, // Connection lifetime before forced refresh
  // SSL configuration: require SSL for remote databases, allow plaintext for localhost/test
  ssl: DATABASE_URL.includes('localhost') || process.env.NODE_ENV === 'test' ? false : 'require',
  prepare: true, // Enable prepared statements for 5-10% query performance boost
  onnotice: () => {}, // Suppress PostgreSQL notices in production
});

const db = drizzle(client, { schema });

// Create a separate pg.Pool specifically for connect-pg-simple session store
// connect-pg-simple requires the pg library's Pool interface, not postgres-js
const sessionPool = new Pool({
  connectionString: DATABASE_URL,
  max: Math.min(5, finalPoolConfig.max), // Use fewer connections for session store
  idleTimeoutMillis: finalPoolConfig.idle_timeout * 1000,
  connectionTimeoutMillis: 10000,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

// Export db for application use
export { db };

// Export postgres-js client for raw SQL operations (migrations, etc.)
export { client as pgClient };

// Export pg.Pool for connect-pg-simple session store
export { sessionPool };

// Export cleanup function to close both postgres-js and pg.Pool connections
export async function closeDatabase() {
  try {
    await Promise.all([
      client.end(),
      sessionPool.end()
    ]);
  } catch (error) {
    // Already closed or connection error - safe to ignore
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Database close error (safe to ignore if already closed):', error);
    }
  }
}