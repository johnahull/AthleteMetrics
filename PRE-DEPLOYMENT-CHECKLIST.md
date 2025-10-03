# Pre-Deployment Checklist

## AthleteMetrics Production Deployment

Use this checklist to ensure a safe and successful production deployment. Each item should be verified before deploying to production.

---

## 🔒 Security Configuration

### Environment Variables

- [ ] **SESSION_SECRET**: Set to a cryptographically random string of at least 64 characters
  - Generate with: `openssl rand -base64 64`
  - **Never** use default or example values in production

- [ ] **ADMIN_USER**: Changed from default "admin" to a unique username
  - Minimum 3 characters
  - Should not be easily guessable

- [ ] **ADMIN_PASS**: Set to a strong password of at least 20 characters
  - Minimum 12 characters (enforced by validation)
  - Recommended: 20+ characters for production
  - Use a password manager to generate

- [ ] **DATABASE_URL**: Points to production PostgreSQL database
  - Verify connection string is correct
  - Ensure database is properly secured
  - Consider using connection pooling (e.g., PgBouncer)

### Security Settings

- [ ] **Rate Limit Bypasses**: Confirm `BYPASS_ANALYTICS_RATE_LIMIT` and `BYPASS_GENERAL_RATE_LIMIT` are either:
  - Not set in production `.env`
  - Set to `false`
  - **Note**: These are automatically disabled in production regardless of `.env` values

- [ ] **HTTPS Enforcement**: Verify SSL/TLS certificates are configured
  - Session cookies will only be sent over HTTPS in production
  - Check reverse proxy (Nginx/CloudFlare) SSL settings

---

## 📊 Database

### Schema & Migrations

- [ ] **Database Schema**: Ensure latest schema is applied
  - Run `npm run db:push` in staging environment first
  - Verify all migrations are successful

- [ ] **Audit Logs Table**: Confirm `audit_logs` table exists
  - Check `shared/schema.ts` for audit log schema
  - Required for admin access logging

- [ ] **Indexes**: Verify performance indexes are created
  - Check frequently queried columns
  - Ensure foreign keys have indexes

### Data Integrity

- [ ] **Backup Strategy**: Production backup system is configured
  - Automated daily backups
  - Point-in-time recovery enabled
  - Backup retention policy defined

- [ ] **Data Migration**: If applicable, verify data migration completed successfully
  - Test data integrity after migration
  - Validate row counts match expectations

---

## 🚀 Performance Configuration

### Resource Limits

- [ ] **SLOW_QUERY_THRESHOLD_MS**: Set appropriately for production monitoring
  - Recommended: `500` to `1000` milliseconds
  - Queries exceeding this will be logged as warnings

- [ ] **Rate Limiting**: Confirm rate limit settings are production-appropriate
  - `ANALYTICS_RATE_WINDOW_MS`: Default 900000 (15 minutes)
  - `ANALYTICS_RATE_LIMIT`: Default 50 requests per window
  - Adjust based on expected traffic

### Session Storage

- [ ] **Redis Configuration**: Production session store configured
  - `REDIS_URL` environment variable set
  - Redis instance is running and accessible
  - **WARNING**: In-memory sessions will cause:
    - Session loss on server restart
    - Cannot scale horizontally
    - Memory leaks over time

---

## 📝 Logging & Monitoring

### Log Configuration

- [ ] **LOG_LEVEL**: Set to appropriate level for production
  - Recommended: `info` or `warn`
  - Avoid `debug` in production (performance impact)

- [ ] **Log Aggregation**: Configure log collection system
  - Logs are output in JSON format in production
  - Set up log aggregation (e.g., CloudWatch, Datadog, Loggly)
  - Configure log retention policies

### Monitoring Setup

- [ ] **Health Check Endpoints**: Verify monitoring is configured
  - `/api/health` - Detailed health status
  - `/api/health/ready` - Kubernetes readiness probe
  - `/api/health/live` - Kubernetes liveness probe

- [ ] **Alerts**: Set up alerts for critical metrics
  - Database connection failures
  - High error rates (>1% of requests)
  - Slow queries exceeding threshold
  - Memory/CPU usage thresholds
  - Session store (Redis) connectivity

---

## 🧪 Testing & Validation

### Pre-Deployment Testing

- [ ] **Unit Tests**: All tests passing
  - Run `npm test`
  - No failing tests
  - Test coverage meets requirements

- [ ] **TypeScript Validation**: No type errors
  - Run `npm run check`
  - Zero TypeScript errors

- [ ] **Build Verification**: Production build succeeds
  - Run `npm run build`
  - No build errors or warnings

- [ ] **Staging Deployment**: Successfully deployed to staging
  - All features working in staging
  - Performance acceptable
  - No errors in staging logs

### Security Testing

- [ ] **Authentication**: Login flow works correctly
  - Admin login successful
  - Session persistence works
  - Logout clears session

- [ ] **Authorization**: Access controls enforced
  - Site admins can access admin features
  - Regular users cannot access admin features
  - Organization-based data isolation works

- [ ] **CSRF Protection**: CSRF tokens working
  - Mutating requests require valid token
  - Invalid tokens are rejected
  - Token refresh works after expiration

### Load Testing (Optional but Recommended)

- [ ] **Performance Testing**: Application handles expected load
  - Simulate expected concurrent users
  - Monitor response times under load
  - Check for memory leaks
  - Verify database connection pooling

---

## 🔧 Infrastructure

### Server Configuration

- [ ] **Node.js Version**: Correct version installed
  - Check `package.json` engines field
  - Use same version as development/staging

- [ ] **Environment**: `NODE_ENV=production`
  - Enables production optimizations
  - Disables debug features
  - Enforces strict security checks

- [ ] **Process Manager**: Production process manager configured
  - PM2, systemd, or Docker orchestration
  - Auto-restart on crash
  - Graceful shutdown handling

### Reverse Proxy

- [ ] **Proxy Configuration**: Nginx/Apache/CloudFlare configured
  - HTTPS termination
  - Request timeout settings
  - Client body size limits
  - Rate limiting at proxy level

- [ ] **Headers**: Proper headers forwarded
  - `X-Forwarded-For` for client IP
  - `X-Real-IP` as fallback
  - Security headers (CSP, HSTS, etc.)

---

## 🔄 Deployment Process

### Pre-Deployment

- [ ] **Maintenance Mode**: Enable maintenance page if applicable
- [ ] **Notification**: Notify users of planned downtime
- [ ] **Team Availability**: Deployment team on standby

### Deployment Steps

- [ ] **Code Deployment**: Latest code deployed
  ```bash
  git checkout main
  git pull origin main
  npm ci --production
  npm run build
  ```

- [ ] **Database Migrations**: Apply any pending migrations
  ```bash
  npm run db:push
  ```

- [ ] **Restart Services**: Restart application gracefully
  ```bash
  pm2 reload ecosystem.config.js --update-env
  # OR
  systemctl restart athletemetrics
  # OR
  kubectl rollout restart deployment/athletemetrics
  ```

### Post-Deployment Verification

- [ ] **Health Checks**: All health endpoints return 200
  - `curl https://yourdomain.com/api/health`
  - `curl https://yourdomain.com/api/health/ready`

- [ ] **Smoke Tests**: Core functionality works
  - [ ] User login
  - [ ] View analytics data
  - [ ] Create measurement
  - [ ] Export data

- [ ] **Log Monitoring**: No errors in production logs
  - Check for startup errors
  - Monitor for 15-30 minutes
  - Verify no unusual error rates

- [ ] **Performance**: Response times acceptable
  - Check average response times
  - Verify slow query logs
  - Monitor database load

---

## 🚨 Rollback Plan

### Rollback Checklist

- [ ] **Rollback Decision**: Clear criteria for when to rollback
  - Error rate >1%
  - Critical feature broken
  - Data integrity issues

- [ ] **Rollback Commands**: Documented and tested
  ```bash
  # Example rollback commands
  git checkout previous-tag
  npm ci --production
  npm run build
  pm2 reload all --update-env
  ```

- [ ] **Database Rollback**: Database migration rollback tested
  - Know which migrations to revert
  - Test rollback in staging first

- [ ] **Communication Plan**: Team knows who to contact
  - On-call engineer identified
  - Escalation path documented

---

## 📞 Post-Deployment

### Monitoring

- [ ] **24-Hour Watch**: Monitor application for 24 hours
  - Check error rates every 2 hours
  - Review user feedback/support tickets
  - Monitor database performance

- [ ] **Performance Baseline**: Record baseline metrics
  - Average response times
  - Database query performance
  - Memory/CPU usage
  - Error rates

### Documentation

- [ ] **Deployment Notes**: Document deployment details
  - Deployment time and date
  - Version/commit deployed
  - Any issues encountered
  - Performance observations

- [ ] **Update Documentation**: Update relevant docs
  - API documentation if endpoints changed
  - Admin documentation for new features
  - User guides if UI changed

---

## 📋 Environment Variables Reference

### Required Variables

| Variable | Description | Example | Validation |
|----------|-------------|---------|------------|
| `NODE_ENV` | Environment mode | `production` | Must be `production` |
| `PORT` | Server port | `5000` | Positive integer |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@host:5432/db` | Must be valid URL |
| `SESSION_SECRET` | Session encryption key | (64+ random chars) | Min 64 chars in prod |
| `ADMIN_USER` | Admin username | `custom_admin` | Min 3 chars, not "admin" in prod |
| `ADMIN_PASS` | Admin password | (20+ random chars) | Min 12 chars (20+ recommended) |

### Optional Variables

| Variable | Description | Default | Recommendation |
|----------|-------------|---------|----------------|
| `LOG_LEVEL` | Logging verbosity | `info` | Use `info` or `warn` in prod |
| `SLOW_QUERY_THRESHOLD_MS` | Slow query threshold | `1000` | Use `500-1000` in prod |
| `ANALYTICS_RATE_WINDOW_MS` | Rate limit window | `900000` | Adjust based on traffic |
| `ANALYTICS_RATE_LIMIT` | Max requests per window | `50` | Increase for high-traffic sites |
| `SENDGRID_API_KEY` | Email service (optional) | - | Required if using email features |
| `REDIS_URL` | Session store | - | **Highly recommended for production** |

---

## ✅ Final Checklist

Before marking deployment as complete:

- [ ] All items in this checklist completed
- [ ] No critical errors in logs
- [ ] Core features tested and working
- [ ] Team notified of successful deployment
- [ ] Monitoring dashboards reviewed
- [ ] Rollback plan is ready if needed

---

## 📚 Additional Resources

- [Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [Express Production Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)
- [PostgreSQL Production Checklist](https://www.postgresql.org/docs/current/runtime-config.html)

---

**Deployment Date**: _________________

**Deployed By**: _________________

**Version/Commit**: _________________

**Sign-off**: _________________
