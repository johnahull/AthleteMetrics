import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Determine dialect based on DATABASE_URL
const isFileDatabase = process.env.DATABASE_URL.startsWith("file:");
const dialect = isFileDatabase ? "sqlite" : "postgresql";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect,
  dbCredentials: isFileDatabase
    ? { url: process.env.DATABASE_URL.replace("file:", "") }
    : { url: process.env.DATABASE_URL },
});
