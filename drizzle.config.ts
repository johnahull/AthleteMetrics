import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const DATABASE_URL = process.env.DATABASE_URL;

// Determine dialect based on DATABASE_URL
let dialect: "postgresql" | "sqlite";
let dbCredentials: any;

if (DATABASE_URL.startsWith('file:')) {
  dialect = "sqlite";
  dbCredentials = {
    url: DATABASE_URL.replace('file:', ''),
  };
} else {
  dialect = "postgresql";
  dbCredentials = {
    url: DATABASE_URL,
  };
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect,
  dbCredentials,
});
