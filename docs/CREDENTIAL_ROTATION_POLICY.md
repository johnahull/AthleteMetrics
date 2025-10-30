# Credential Rotation Policy

## Overview

This document outlines the credential rotation policy for AthleteMetrics E2E testing infrastructure and production systems.

## E2E Test Credentials

### Rotation Schedule

**Staging Environment:**
- Rotation Frequency: Every 90 days
- GitHub Secrets to rotate:
  - `STAGING_USERNAME` / `STAGING_PASSWORD`
  - `E2E_SITE_ADMIN_USERNAME` / `E2E_SITE_ADMIN_PASSWORD`
  - `E2E_ORG_ADMIN_USERNAME` / `E2E_ORG_ADMIN_PASSWORD`
  - `E2E_COACH_USERNAME` / `E2E_COACH_PASSWORD`
  - `E2E_ATHLETE_USERNAME` / `E2E_ATHLETE_PASSWORD`

**Testing Environment:**
- Rotation Frequency: Every 90 days
- GitHub Secrets to rotate:
  - `TESTING_USERNAME` / `TESTING_PASSWORD`
  - Additional RBAC test users (same as staging)

### Rotation Procedure

1. **Generate New Credentials**
   ```bash
   # Generate secure password (16+ characters, mixed case, numbers, symbols)
   openssl rand -base64 24 | tr -d "=+/" | head -c 20
   ```

2. **Update Database**
   - For staging: Update user password via Railway CLI or admin panel
   - For testing: Update user password via Railway CLI or admin panel
   ```bash
   railway run --environment staging bash
   # Update user password in database using bcrypt hash
   ```

3. **Update GitHub Secrets**
   - Navigate to: Settings > Secrets and variables > Actions
   - Update each credential secret
   - Verify no workflows are currently running

4. **Verify Changes**
   - Trigger E2E test workflow manually
   - Confirm tests pass with new credentials
   - Check auth state is saved correctly

### Database Credentials

**Railway Database Connection Strings:**
- Rotation Frequency: Every 90 days
- Affected Secrets:
  - `DATABASE_URL` (staging)
  - `TESTING_DATABASE_URL` (testing)
  - `RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL` (production - extra caution)

**Rotation Procedure:**
1. Railway automatically rotates connection strings on database restart
2. Update GitHub Secrets immediately after rotation
3. Re-run failed workflows if rotation occurred mid-workflow

**Important:** Database credential rotation should be coordinated with deployment schedules to minimize service disruption.

## Production Credentials

### Rotation Schedule

**Production Environment:**
- Rotation Frequency: Every 60 days (more frequent than staging)
- Affected Secrets:
  - `ADMIN_USER` / `ADMIN_PASSWORD` (application admin)
  - `RAILWAY_PRODUCTION_TOKEN` (deployment token)
  - `RAILWAY_PRODUCTION_PUBLIC_DATABASE_URL` (database connection)

### Rotation Procedure

1. **Schedule Maintenance Window**
   - Notify team 48 hours in advance
   - Choose low-traffic time period
   - Prepare rollback plan

2. **Rotate Credentials**
   - Update production database credentials via Railway dashboard
   - Update GitHub Secrets for production deploy workflow
   - Update deployment tokens

3. **Verify Production**
   - Trigger production deployment with updated credentials
   - Run smoke tests
   - Monitor application health for 24 hours

### Emergency Rotation

**Trigger Conditions:**
- Credential leak detected
- Security breach suspected
- Employee offboarding with production access

**Procedure:**
1. Immediately rotate affected credentials
2. Update all dependent systems
3. Audit access logs
4. Document incident

## Monitoring and Alerts

### Credential Expiry Warnings

Set up calendar reminders:
- 14 days before rotation due
- 7 days before rotation due
- 1 day before rotation due

### Audit Trail

Maintain audit log for credential rotations:
- Date rotated
- Rotated by (team member)
- Reason (scheduled / emergency)
- Systems affected
- Verification status

## Security Best Practices

1. **Never hardcode credentials** in source code or configuration files
2. **Use GitHub Secrets** for all sensitive environment variables
3. **Rotate immediately** if credentials are accidentally committed to version control
4. **Use strong passwords**:
   - Minimum 16 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Avoid dictionary words
5. **Limit access**: Only grant production credential access to essential team members
6. **Two-factor authentication**: Enable 2FA on all admin accounts

## Compliance

This policy aligns with:
- OWASP Credential Management Guidelines
- CIS Benchmarks for Secure Configuration
- NIST SP 800-63B Digital Identity Guidelines

## Policy Review

This policy should be reviewed and updated:
- Annually (January each year)
- After security incidents
- When new systems are added
- When compliance requirements change

---

**Last Updated:** 2025-10-30
**Next Review:** 2026-01-30
**Policy Owner:** Engineering Team
