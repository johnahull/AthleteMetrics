import { defineConfig } from "drizzle-kit";

// DATABASE_URL will be injected by Railway CLI when using `railway run`
// Use a placeholder for config file parsing, actual connection will use injected value
const databaseUrl = process.env.DATABASE_URL || "postgresql://placeholder";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl
  },
});
