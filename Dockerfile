# AthleteMetrics Production Dockerfile
# Multi-stage build for optimized production image

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install runtime dependencies for sharp and tesseract
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    tesseract-ocr \
    tesseract-ocr-data-eng

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder stage
# Note: With npm workspaces, dist/index.js bundles all code including shared types
# No need to copy packages/shared separately
COPY --from=builder /app/dist ./dist

# Copy migrations and scripts (needed for db:migrate at startup)
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

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the application
# Run migrations before starting server (matches Railway nixpacks behavior)
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
