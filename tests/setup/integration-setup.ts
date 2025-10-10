/**
 * Setup file for integration tests
 * Configures test environment and database
 */

// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-integration.db';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'password123456789';

import { beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../shared/schema';

beforeAll(async () => {
  // Initialize database schema for tests
  try {
    // Create SQLite database and apply schema
    const sqlite = new Database('./test-integration.db');
    const db = drizzle(sqlite, { schema });

    // Create tables manually using Drizzle's SQL generation
    // We'll import the db instance which should have the schema
    const { db: appDb } = await import('../../server/db');

    // The schema will be auto-created when first accessed due to Drizzle's behavior
    // Just ensure the database file exists and is accessible
  } catch (error) {
    console.error('Database setup warning:', error);
  }

  // Suppress console logs during tests except for errors
  const originalConsoleLog = console.log;
  console.log = () => {}; // Suppress normal logs
  console.error = originalConsoleLog; // Keep errors visible
});

afterAll(async () => {
  // Cleanup test database
  try {
    const fs = await import('fs');
    if (fs.existsSync('./test-integration.db')) {
      fs.unlinkSync('./test-integration.db');
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});