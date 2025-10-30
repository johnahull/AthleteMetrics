# Rate Limiting Strategy

## Overview

AthleteMetrics implements tiered rate limiting using `express-rate-limit` to protect API endpoints from abuse, prevent DoS attacks, and ensure fair resource allocation across users. Different endpoint categories have different limits based on their computational cost and business requirements.

## Rate Limit Tiers

All rate limits are applied per **15-minute sliding window** (900,000ms). Limits are configured in `packages/api/constants/rate-limits.ts`:

| Tier | Limit | Window | Use Case | Example Endpoints |
|------|-------|--------|----------|-------------------|
| **STANDARD** | 100 req | 15 min | Standard read operations | Team lists, basic queries |
| **HIGH_VOLUME** | 200 req | 15 min | High-volume read operations | Measurement queries with filters |
| **MUTATION** | 20 req | 15 min | Create/update operations | POST/PUT endpoints |
| **DELETE** | 30 req | 15 min | Delete operations | DELETE endpoints |
| **ANALYTICS** | 50 req | 15 min | Computationally expensive queries | Percentile calculations, complex aggregations |

### Rate Limit Configuration

Rate limits are defined as constants with inline documentation:

```typescript
// packages/api/constants/rate-limits.ts
export const RATE_LIMITS = {
  STANDARD: 100,      // Standard read operations
  HIGH_VOLUME: 200,   // High-volume read operations (measurements)
  MUTATION: 20,       // Create/update operations
  DELETE: 30,         // Delete operations (stricter limit)
  ANALYTICS: 50,      // Analytics queries (configurable via env var)
} as const;

export const RATE_LIMIT_WINDOW_MS = 900000; // 15 minutes
```

## Measurement Endpoints

The measurement routes (`packages/api/routes/measurement-routes.ts`) implement two distinct rate limiters:

### 1. Measurement Read/Write Limiter (HIGH_VOLUME)

Applied to:
- `GET /api/measurements` - Query measurements with filters
- `GET /api/measurements/:id` - Get single measurement
- `POST /api/measurements` - Create measurement
- `PUT /api/measurements/:id` - Update measurement
- `POST /api/measurements/:id/verify` - Verify measurement

**Configuration:**
```typescript
const measurementLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,        // 15 minutes
  limit: RATE_LIMITS.HIGH_VOLUME,        // 200 requests
  message: { message: "Too many measurement requests, please try again later." },
  standardHeaders: 'draft-7',            // RateLimit-* headers
  legacyHeaders: false,                  // No X-RateLimit-* headers
});
```

**Rationale:**
- Measurement queries are the most frequent operations in the system
- Chart components may request 20,000 measurements per query
- Coaches/admins need to perform bulk data entry during training sessions
- 200 requests per 15 minutes = ~13 requests/minute (sufficient for normal use)

### 2. Measurement Delete Limiter (DELETE)

Applied to:
- `DELETE /api/measurements/:id` - Delete measurement

**Configuration:**
```typescript
const measurementDeleteLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,        // 15 minutes
  limit: RATE_LIMITS.DELETE,             // 30 requests
  message: { message: "Too many deletion attempts, please try again later." },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
```

**Rationale:**
- Delete operations are more sensitive than updates
- Stricter limit prevents accidental mass deletion
- 30 deletes per 15 minutes = 2 deletes/minute (sufficient for error correction)
- Separate limiter isolates delete abuse from other operations

## Environment-Based Configuration

### Analytics Rate Limiting

Analytics endpoints support environment variable overrides for flexibility in different deployment environments:

```bash
# Override analytics request limit (default: 50)
ANALYTICS_RATE_LIMIT=100

# Override rate limiting window (default: 900000ms = 15 minutes)
ANALYTICS_RATE_WINDOW_MS=300000  # 5 minutes

# Custom error message
ANALYTICS_RATE_LIMIT_MESSAGE="Too many analytics requests from this IP, please try again later."
```

### File Upload Rate Limiting

File upload endpoints (CSV import, photo OCR) have dedicated rate limiting:

```bash
# Maximum file uploads per 15-minute window (default: 20)
UPLOAD_RATE_LIMIT=20
```

**Security Note:** Upload rate limiting protects against:
- Mass file upload attacks that could exhaust storage
- DoS attacks through large file processing
- Abuse of OCR API quota limits

### Development Bypasses (Testing Only)

**⚠️ WARNING:** These bypasses are **automatically disabled in production** (`NODE_ENV=production`) regardless of environment variable settings:

```bash
# Bypass analytics rate limiting for site admins (default: false)
BYPASS_ANALYTICS_RATE_LIMIT=true

# Bypass general API rate limiting (default: false)
BYPASS_GENERAL_RATE_LIMIT=true
```

**Security Safeguards:**
1. Bypasses are explicitly disabled when `NODE_ENV=production`
2. Multiple layers of checks prevent accidental production bypass
3. CI/CD workflows enforce production environment variable validation

## Rate Limit Headers

All rate-limited endpoints return standard **RFC 6585** compliant headers:

### Success Response (Within Limit)
```http
HTTP/1.1 200 OK
RateLimit-Limit: 200
RateLimit-Remaining: 195
RateLimit-Reset: 1698765432
```

### Rate Limit Exceeded Response
```http
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 200
RateLimit-Remaining: 0
RateLimit-Reset: 1698765432
Content-Type: application/json

{
  "message": "Too many measurement requests, please try again later."
}
```

**Header Definitions:**
- `RateLimit-Limit`: Maximum number of requests allowed in the window
- `RateLimit-Remaining`: Number of requests remaining in current window
- `RateLimit-Reset`: Unix timestamp (seconds) when the window resets

## Implementation Details

### Rate Limiter Isolation

Each rate limiter maintains **independent counters** per IP address:

```typescript
// Example: Separate counters for GET and DELETE
app.get('/api/measurements', measurementLimiter, requireAuth, handler);  // Counter A
app.delete('/api/measurements/:id', measurementDeleteLimiter, requireAuth, handler);  // Counter B
```

**Benefits:**
- Deleting measurements doesn't consume GET request quota
- Users can perform normal operations even after hitting delete limit
- Prevents cascading rate limit exhaustion

### In-Memory Storage

Rate limit counters are stored **in-memory** using `express-rate-limit`'s default store:

**Pros:**
- Fast lookups (no external dependencies)
- Zero network latency
- Simple deployment (no Redis required)

**Cons:**
- Counters reset on server restart
- Not shared across multiple server instances

**Production Considerations:**
If deploying multiple server instances (horizontal scaling), consider using a shared store:

```typescript
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL
});

const measurementLimiter = rateLimit({
  store: new RedisStore({
    client: client,
    prefix: 'rl:measurements:',
  }),
  windowMs: RATE_LIMIT_WINDOW_MS,
  limit: RATE_LIMITS.HIGH_VOLUME,
});
```

## Testing Rate Limiting

### Unit Tests

Located in `packages/api/routes/__tests__/measurement-routes.ratelimit.test.ts`:

```typescript
describe('Rate Limiting Tests', () => {
  it('should include rate limit headers in response', async () => {
    const res = await request(app).get('/api/measurements');
    expect(res.headers['ratelimit-limit']).toBe('200');
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('should maintain separate counters for GET and DELETE', async () => {
    // Verify rate limit isolation between endpoints
  });
});
```

**Note:** Testing actual limit exhaustion (200+ requests) would significantly slow down test suites. For comprehensive rate limit testing:

1. **Integration Tests:** Deploy to staging and use load testing tools:
   ```bash
   # k6 load test example
   k6 run --vus 10 --duration 30s rate-limit-test.js
   ```

2. **Manual Testing:** Use scripts to verify 429 responses:
   ```bash
   for i in {1..210}; do
     curl -i https://staging.athletemetrics.com/api/measurements
   done
   ```

3. **CI/CD Validation:** GitHub Actions workflows ensure rate limiters are properly configured

### Test Database Cleanup

CI/CD pipelines include automatic test database cleanup to prevent data leakage:

```yaml
- name: Cleanup test database
  if: always()
  run: ./scripts/ci-test-cleanup.sh
  env:
    DATABASE_URL: postgresql://test_user:test_password@localhost:5432/athletemetrics_test
```

**Cleanup Script:** `scripts/ci-test-cleanup.sh`
- Drops all tables, sequences, and views
- Runs even if tests fail (`if: always()`)
- Prevents test data from affecting subsequent test runs

## Security Considerations

### IP-Based Tracking

Rate limiters track requests by **client IP address** (default behavior):

```typescript
// Default keyGenerator extracts IP from req.ip
const limiter = rateLimit({
  keyGenerator: (req) => req.ip, // Uses X-Forwarded-For in production
});
```

**Behind Reverse Proxies:**
Ensure Express is configured to trust proxy headers:

```typescript
// packages/api/index.ts
app.set('trust proxy', 1); // Trust first proxy
```

### DDoS Protection

Rate limiting provides **basic DDoS protection**, but is not a replacement for:
- **CloudFlare/AWS Shield:** Network-layer DDoS protection
- **WAF (Web Application Firewall):** Application-layer attack detection
- **Load Balancers:** Traffic distribution and health checks

### File Upload Protection

CSV import and photo upload endpoints have **additional security layers**:

```typescript
// File size limits (prevent memory exhaustion)
MAX_CSV_FILE_SIZE=5242880    # 5MB
MAX_IMAGE_FILE_SIZE=10485760 # 10MB

// Row limits (prevent CSV bomb attacks)
MAX_CSV_ROWS=10000

// Rate limiting (prevent storage exhaustion)
UPLOAD_RATE_LIMIT=20  # per 15 minutes
```

**Production Recommendation:** Integrate virus scanning middleware (e.g., ClamAV) for uploaded files.

## Monitoring and Observability

### Logging

Rate limit events are logged for security auditing:

```typescript
// Log rate limit hits (429 responses)
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    if (res.statusCode === 429) {
      console.warn(`Rate limit exceeded: ${req.ip} - ${req.method} ${req.path}`);
    }
    return originalSend.call(this, data);
  };
  next();
});
```

### Metrics

**Recommended Production Metrics:**
- Rate limit hit rate (429 responses / total requests)
- Requests per IP address distribution
- Time-series analysis of rate limit triggers
- Correlation with system load metrics

**Tools:**
- **Prometheus + Grafana:** Track rate limit metrics
- **Sentry:** Alert on sustained 429 errors
- **Railway Logs:** Monitor rate limit warnings in production

## Troubleshooting

### Common Issues

**1. Legitimate Users Hitting Rate Limits**

**Symptoms:**
- Complaints of "too many requests" errors during normal use
- Rate limit headers showing `RateLimit-Remaining: 0` frequently

**Solutions:**
- Increase rate limit for the affected tier: `ANALYTICS_RATE_LIMIT=100`
- Optimize frontend to batch requests (e.g., query 20,000 measurements at once vs. 200 queries of 100)
- Implement request caching on frontend (React Query staleTime)

**2. Rate Limits Not Working**

**Symptoms:**
- No rate limit headers in responses
- 429 errors never trigger

**Checklist:**
- Verify rate limiter middleware is registered **before** route handlers
- Check `trust proxy` setting if behind reverse proxy
- Ensure rate limiter is not bypassed in production

**3. Rate Limits Resetting Unexpectedly**

**Cause:** Server restarts clear in-memory rate limit counters

**Solutions:**
- Migrate to Redis-based rate limiting for multi-instance deployments
- Accept counter resets as acceptable tradeoff for simplicity

## Future Enhancements

### Planned Improvements

1. **User-Based Rate Limiting**
   - Track limits per authenticated user ID instead of IP
   - Prevents shared IP issues (corporate networks, VPNs)

2. **Dynamic Rate Limiting**
   - Adjust limits based on system load
   - Burst allowance for short-term spikes

3. **Rate Limit Dashboard**
   - Admin UI showing current rate limit status per user
   - Historical rate limit analytics

4. **Graduated Rate Limits**
   - Higher limits for paid tiers
   - Team-based rate limit pools (shared across organization)

### Redis Migration Example

For production deployments with multiple server instances:

```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

await redisClient.connect();

const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'rl:measurements',
  points: RATE_LIMITS.HIGH_VOLUME,
  duration: RATE_LIMIT_WINDOW_MS / 1000, // seconds
  blockDuration: 0, // Don't block, just reject
});

const rateLimitMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => next())
    .catch(() => {
      res.status(429).json({
        message: "Too many requests, please try again later."
      });
    });
};
```

## References

- [RFC 6585 - HTTP Status Code 429](https://tools.ietf.org/html/rfc6585)
- [express-rate-limit Documentation](https://github.com/express-rate-limit/express-rate-limit)
- [OWASP API Security - Rate Limiting](https://owasp.org/www-project-api-security/)
- [Railway Rate Limiting Best Practices](https://docs.railway.app/guides/optimize#rate-limiting)

## Related Documentation

- [Security Documentation](./SECURITY.md) - Authentication and authorization
- [Performance Optimizations](./PERFORMANCE_OPTIMIZATIONS.md) - Query optimization
- [Permission Middleware Migration](./PERMISSION_MIDDLEWARE_MIGRATION.md) - Access control
