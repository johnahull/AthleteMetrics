# AthleteMetrics Production Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies for native modules (python3/make/g++ for node-gyp)
RUN apk add --no-cache python3 make g++

# Copy package files including workspace package.json files
COPY package*.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
ENV NODE_ENV=production
RUN npm run build

# Prune devDependencies from existing node_modules (keeps workspace deps intact)
# Note: npm prune --omit=dev removes devDeps without reinstalling, preserving
# workspace dependency resolution that npm ci --omit=dev can break
RUN npm prune --omit=dev

# Flatten nested workspace node_modules into root node_modules
# npm workspace hoisting puts some packages in packages/*/node_modules/ when there
# are version conflicts. Since dist/index.js runs from /app/dist/, it can only find
# packages in /app/node_modules/ (not packages/api/node_modules/). Copy them to root.
# Only api and shared — web deps are frontend-only and not needed at runtime.
# Note: workspace versions intentionally overwrite root-hoisted versions. This is safe
# because the workspace version is what the package's own code was tested against.
RUN cp -r packages/api/node_modules/* node_modules/ 2>/dev/null; \
    cp -r packages/shared/node_modules/* node_modules/ 2>/dev/null; \
    true

# Stage 2: Production stage
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install runtime dependencies for tesseract OCR
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

# Copy production node_modules from builder (includes workspace deps + compiled native modules)
# Note: We copy from builder instead of running npm ci in production stage because
# npm ci --omit=dev in a clean workspace context fails to install workspace dependencies
# (e.g., express-rate-limit from packages/api/package.json)
COPY --from=builder /app/node_modules ./node_modules

# Copy package files (needed for Node.js module resolution and "type": "module")
COPY package*.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/

# Copy built application from builder stage
# Note: @shared code is now bundled into dist/index.js via esbuild alias
COPY --from=builder /app/dist ./dist

# Copy migrations and scripts (needed for db:migrate at startup)
# drizzle/migrations: Drizzle ORM migrations (0000-0013) with snapshots
# migrations: Manual SQL migrations (0014+) without drizzle snapshots
COPY --from=builder /app/drizzle/migrations ./drizzle/migrations
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (default 5000)
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Railway handles healthchecks via railway.json - no Docker HEALTHCHECK needed
# (Docker HEALTHCHECK can conflict with Railway's healthcheck system)

# Start the application via entrypoint script
# Migrations are non-fatal (PR environments share testing DB where migrations are already applied)
CMD ["sh", "scripts/docker-entrypoint.sh"]
