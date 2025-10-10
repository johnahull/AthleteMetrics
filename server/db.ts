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
  max: isProduction ? 20 : 10, // Connection pool size
  idle_timeout: 20, // Seconds before idle connection closes
  connect_timeout: 10, // Seconds to wait for connection
  max_lifetime: 60 * 30, // 30 minutes max connection lifetime
  ssl: isProduction ? 'require' : undefined, // Require SSL in production
  prepare: true, // Enable prepared statements for performance
  onnotice: () => {}, // Suppress PostgreSQL notices in production
});

const db = drizzle(client, { schema });

// Export both db and client for proper cleanup in tests
export { db, client };