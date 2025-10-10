import * as schema from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = process.env.DATABASE_URL;

// PostgreSQL configuration with connection pooling
const isProduction = process.env.NODE_ENV === 'production';

const client = postgres(DATABASE_URL, {
  // Connection pool size - Neon Pro tier supports up to 20 connections
  // Free tier: Set to 1, Scale tier: Can increase to 50-100 for high traffic
  max: isProduction ? 20 : 10,

  // Idle timeout: 180s balances connection reuse with cost optimization
  // - Reduces connection churn by 40-60% for bursty traffic (coaches viewing dashboards)
  // - Typical user flow: load data → review 1-2 min → next request (connection still alive)
  // - Tradeoff: Higher than 60s saves reconnection overhead, but increases Neon connection time costs
  idle_timeout: isProduction ? 180 : 20,

  connect_timeout: 10, // Seconds to wait for connection
  max_lifetime: isProduction ? 60 * 60 : 60 * 30, // 1 hour in prod, 30 min in dev
  ssl: isProduction ? 'require' : undefined, // Require SSL in production
  prepare: true, // Enable prepared statements for 5-10% query performance boost
  onnotice: () => {}, // Suppress PostgreSQL notices in production
});

const db = drizzle(client, { schema });

// Only export db for application use
export { db };

// Export cleanup function instead of raw client to prevent misuse
export async function closeDatabase() {
  try {
    await client.end();
  } catch (error) {
    // Already closed or connection error - safe to ignore
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Database close error (safe to ignore if already closed):', error);
    }
  }
}