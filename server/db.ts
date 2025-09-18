import * as schema from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import postgres from 'postgres';
import Database from 'better-sqlite3';

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const DATABASE_URL = process.env.DATABASE_URL;

// Determine which database to use based on URL
const isFileDatabase = DATABASE_URL.startsWith("file:");

let db: any;

if (isFileDatabase) {
  // SQLite configuration
  const sqliteClient = new Database(DATABASE_URL.replace("file:", ""));
  db = drizzleSqlite(sqliteClient, { schema });
} else {
  // PostgreSQL configuration
  const client = postgres(DATABASE_URL);
  db = drizzle(client, { schema });
}

export { db };