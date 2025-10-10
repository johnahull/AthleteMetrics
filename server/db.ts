import * as schema from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = process.env.DATABASE_URL;

// PostgreSQL configuration
const client = postgres(DATABASE_URL);
const db = drizzle(client, { schema });

export { db };