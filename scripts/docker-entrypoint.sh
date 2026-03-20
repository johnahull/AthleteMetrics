#!/bin/sh
# Docker entrypoint for AthleteMetrics
# Runs migrations then starts the server

echo "[startup] node=$(node -v) port=$PORT env=$NODE_ENV pid=$$"

# PR environments share the testing database where migrations are already applied.
# Skip migrations to avoid connection timeouts eating into the healthcheck window.
if [ "$IS_PR_ENVIRONMENT" = "true" ]; then
  echo "[startup] PR environment detected - skipping migrations (shared testing DB)"
elif [ "$NODE_ENV" = "production" ] || [ "$NODE_ENV" = "staging" ]; then
  # Production/staging: migrations are fatal — a schema mismatch risks silent data corruption
  echo "[startup] running drizzle migrations (fatal)..."
  node scripts/run-migrations.js || { echo "[startup] FATAL: drizzle migrations failed"; exit 1; }
  echo "[startup] drizzle migrations complete"

  echo "[startup] running manual migrations (fatal)..."
  node scripts/apply-manual-migrations.js || { echo "[startup] FATAL: manual migrations failed"; exit 1; }
  echo "[startup] manual migrations complete"
else
  # Other environments (testing, development): non-fatal to ease local dev
  echo "[startup] running drizzle migrations..."
  if node scripts/run-migrations.js; then
    echo "[startup] drizzle migrations complete"
  else
    echo "[startup] WARN: drizzle migrations failed (exit $?) - continuing anyway"
  fi

  echo "[startup] running manual migrations..."
  if node scripts/apply-manual-migrations.js; then
    echo "[startup] manual migrations complete"
  else
    echo "[startup] WARN: manual migrations failed (exit $?) - continuing anyway"
  fi
fi

echo "[startup] starting server..."
exec node dist/index.js
