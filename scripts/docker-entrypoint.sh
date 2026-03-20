#!/bin/sh
# Docker entrypoint for AthleteMetrics
# Runs migrations (non-fatal) then starts the server

echo "[startup] node=$(node -v) port=$PORT env=$NODE_ENV pid=$$"

# PR environments share the testing database where migrations are already applied.
# Skip migrations to avoid connection timeouts eating into the healthcheck window.
if [ "$IS_PR_ENVIRONMENT" = "true" ]; then
  echo "[startup] PR environment detected - skipping migrations (shared testing DB)"
else
  # Run drizzle migrations (non-fatal to prevent startup failure)
  echo "[startup] running drizzle migrations..."
  if node scripts/run-migrations.js; then
    echo "[startup] drizzle migrations complete"
  else
    echo "[startup] WARN: drizzle migrations failed (exit $?) - continuing anyway"
  fi

  # Run manual SQL migrations (non-fatal)
  echo "[startup] running manual migrations..."
  if node scripts/apply-manual-migrations.js; then
    echo "[startup] manual migrations complete"
  else
    echo "[startup] WARN: manual migrations failed (exit $?) - continuing anyway"
  fi
fi

echo "[startup] starting server..."
exec node dist/index.js
