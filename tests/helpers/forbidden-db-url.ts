/**
 * Hosts and names that mark a production or staging database. Integration tests write and delete rows, so
 * they refuse to run against a DATABASE_URL containing any of these (tests/setup/integration-setup.ts), and
 * the leak check (tests/setup/leak-check-global.ts) must not even connect to such a database.
 */
export const FORBIDDEN_DB_URL_PATTERNS = [
  'railway.app',      // Railway production/staging
  'neon.tech',        // Neon production/staging
  'supabase.co',      // Supabase production/staging
  'amazonaws.com',    // AWS RDS
  'cloudflare.com',   // Cloudflare D1
  'planetscale',      // PlanetScale
  'prod',             // Any URL containing "prod"
  'production',       // Any URL containing "production"
  'staging',          // Any URL containing "staging"
];

/** The first forbidden pattern the url contains (case-insensitive), or undefined when it is safe. */
export function findForbiddenPattern(dbUrl: string): string | undefined {
  const lower = dbUrl.toLowerCase();
  return FORBIDDEN_DB_URL_PATTERNS.find((pattern) => lower.includes(pattern.toLowerCase()));
}
