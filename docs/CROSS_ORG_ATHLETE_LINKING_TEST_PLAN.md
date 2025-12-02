# Test Plan: Cross-Organization Athlete Linking

## Overview

This document provides a comprehensive test plan for the Cross-Organization Athlete Linking feature, which allows athletes to link their accounts across multiple organizations for unified performance data viewing and cross-org identity management.

---

## 1. Auto-Linking Flow (Email Verification)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1.1 | First user creates global athlete | 1. User signs up with email `test@example.com` 2. User verifies email | Global athlete record created with user's email as primary |
| 1.2 | Second user auto-links to existing | 1. User2 signs up with same email `test@example.com` 2. User2 verifies email | User2 auto-linked to existing global athlete |
| 1.3 | Auto-link sends notification | Same as 1.2 | Email notification sent to User2 about account linking |
| 1.4 | Auto-link respects privacy setting | 1. User1 disables cross-org linking 2. User2 verifies same email | User2 gets separate global athlete (not linked) |
| 1.5 | Measurements backfilled on link | 1. User has existing measurements 2. User verifies email | All measurements updated with globalAthleteId |

---

## 2. Notification System

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.1 | View pending notification | 1. Log in as auto-linked user 2. Call GET `/api/my/global-athlete/notifications` | Returns pending notification with linked orgs |
| 2.2 | Acknowledge notification | 1. Click acknowledge 2. POST `/api/my/global-athlete/notifications/:id/acknowledge` | Notification marked acknowledged, timestamp set |
| 2.3 | No notification for primary user | 1. Log in as first user (created global athlete) 2. Check notifications | Empty array returned |
| 2.4 | Email contains correct orgs | 1. Auto-link triggers 2. Check email content | Lists all organizations linked to global athlete |

---

## 3. Manual Claim Flow

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 3.1 | Initiate claim request | 1. POST `/api/my/global-athlete/claims` with `{email: "other@example.com"}` | Claim record created, verification email sent |
| 3.2 | Verify claim token | 1. Click link in email 2. GET `/api/verify-claim?token=...` | Email added to global athlete's verified emails |
| 3.3 | Reject invalid email format | 1. POST claim with `{email: "not-an-email"}` | 400 error: "Invalid email format" |
| 3.4 | Reject duplicate pending claim | 1. Initiate claim for email 2. Initiate same claim again | Error: "A claim for this email is already pending" |
| 3.5 | Reject if target disabled linking | 1. User2 disables cross-org linking 2. User1 claims User2's email | Error: "disabled cross-organization linking" |
| 3.6 | Expired token rejected | 1. Wait >24 hours 2. Click verification link | Error: "Invalid or expired verification link" |
| 3.7 | Cancel pending claim | 1. DELETE `/api/my/global-athlete/claims/:id` | Claim status changed to "cancelled" |
| 3.8 | View pending claims | 1. GET `/api/my/global-athlete/claims` | Returns list of user's pending claims |

---

## 4. Admin Management

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.1 | List all global athletes | 1. Log in as site admin 2. GET `/api/admin/global-athletes` | Returns paginated list with linked user counts |
| 4.2 | Search by email | 1. GET `/api/admin/global-athletes?search=test@example.com` | Filters results by email match |
| 4.3 | Search by name | 1. GET `/api/admin/global-athletes?search=John Doe` | Filters results by name match |
| 4.4 | View athlete details | 1. GET `/api/admin/global-athletes/:id` | Returns athlete, linked users, orgs, audit log |
| 4.5 | Force unlink user | 1. POST `/api/admin/global-athletes/:id/unlink/:userId` | User unlinked, audit log entry created |
| 4.6 | Toggle privacy setting | 1. PATCH `/api/admin/global-athletes/:id/privacy` with `{allowCrossOrgLinking: false}` | Setting updated, audit log entry created |
| 4.7 | View dashboard stats | 1. GET `/api/admin/global-athletes/stats` | Returns totals, multi-link count, recent activity |
| 4.8 | Non-admin access denied | 1. Log in as regular user 2. Call admin endpoints | 403 Forbidden |

---

## 5. Privacy Controls

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.1 | Disable cross-org linking | 1. PATCH `/api/my/global-athlete/privacy` with `{allowCrossOrgLinking: false}` | Setting saved, other links revoked |
| 5.2 | Re-enable linking | 1. PATCH with `{allowCrossOrgLinking: true}` | Setting saved (revoked links stay revoked) |
| 5.3 | Toggle measurement sharing | 1. PATCH `/api/my/global-athlete/sharing` with `{shareMeasurements: false}` | User's measurements excluded from unified view |

---

## 6. Unified Data Views

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 6.1 | Get unified measurements | 1. GET `/api/my/unified-measurements` | Returns measurements from all linked accounts |
| 6.2 | Respects share preference | 1. User2 disables sharing 2. Get unified measurements | User2's measurements excluded |
| 6.3 | Get unified dashboard | 1. GET `/api/my/unified-dashboard` | Returns aggregated stats, org list, recent data |
| 6.4 | View audit log | 1. GET `/api/my/global-athlete/audit-log` | Returns chronological audit entries |

---

## 7. Security Tests

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 7.1 | Rate limiting on verify-claim | 1. Send 100+ requests to `/api/verify-claim` rapidly | Rate limited after threshold |
| 7.2 | Token enumeration prevented | 1. Try various invalid tokens 2. Try expired token 3. Try verified token | Same generic error for all cases |
| 7.3 | SQL injection in search | 1. Search with `%' OR '1'='1` | Wildcards escaped, no injection |
| 7.4 | XSS in email templates | 1. Set name to `<script>alert(1)</script>` 2. Trigger email | HTML escaped in email output |
| 7.5 | Missing BASE_URL handled | 1. Unset BASE_URL env var 2. Initiate claim | Error: "Email service is not properly configured" |
| 7.6 | Cannot cancel another's claim | 1. User2 tries to cancel User1's claim | Error: "Not authorized" |
| 7.7 | Cannot acknowledge another's notification | 1. User2 tries to acknowledge User1's notification | Error: "Not authorized" |

---

## 8. Edge Cases

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.1 | User with no global athlete | 1. New user (unverified) 2. Call global athlete endpoints | 404: "No global athlete profile found" |
| 8.2 | Empty search results | 1. Search for non-existent email | Empty array returned |
| 8.3 | Pagination boundaries | 1. Request page beyond data 2. Request limit=0 | Empty array / defaults applied |
| 8.4 | Double verification attempt | 1. Verify claim 2. Click link again | Error: "Invalid or expired verification link" |
| 8.5 | Claim email you already own | 1. Claim your own verified email | Should handle gracefully |

---

## 9. Database Integrity

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.1 | Cascade delete on unlink | 1. Admin force unlinks user | Link deleted, global athlete remains |
| 9.2 | Audit log completeness | 1. Perform all operations 2. Check audit log | Every action has corresponding audit entry |
| 9.3 | Claim token uniqueness | 1. Generate many claims | All tokens unique (64-char hex) |
| 9.4 | Expiry cleanup | 1. Claim expires 2. Verify expired claim | Status updated to "expired" |

---

## Test Environment Requirements

### Prerequisites
- **Database**: PostgreSQL with test data isolation
- **Email**: Mock SendGrid or test mode (logs to console)
- **Auth**: Test users with various roles (athlete, coach, site admin)
- **BASE_URL**: Set to test environment URL

### Environment Variables
```bash
DATABASE_URL=postgresql://...
ALLOW_TEST_DATABASE=true
BASE_URL=https://test.athletemetrics.com
SENDGRID_API_KEY=<optional for mocking>
```

### Test Data Setup

```sql
-- Minimum test data needed:
-- 2 organizations (different types)
-- 3 users (1 site admin, 2 athletes in different orgs)
-- Pre-existing measurements for linking tests
```

### Running Tests

```bash
# Run all global athlete tests
npm run test:unit -- packages/api/__tests__/global-athlete-*.test.ts

# Run specific test file
npm run test:unit -- packages/api/__tests__/global-athlete-claim.test.ts

# Run with database connection
DATABASE_URL="..." ALLOW_TEST_DATABASE=true npm run test:unit
```

---

## Test Coverage Summary

| Category | Test Cases | Status |
|----------|------------|--------|
| Auto-Linking Flow | 5 | Unit tests: `global-athlete-service.test.ts` |
| Notification System | 4 | Unit tests: `global-athlete-notification.test.ts` |
| Manual Claim Flow | 8 | Unit tests: `global-athlete-claim.test.ts` |
| Admin Management | 8 | Unit tests: `global-athlete-admin.test.ts` |
| Privacy Controls | 3 | Unit tests: `global-athlete-service.test.ts` |
| Unified Data Views | 4 | Unit tests: `global-athlete-service.test.ts` |
| Security Tests | 7 | Manual + automated |
| Edge Cases | 5 | Unit tests across files |
| Database Integrity | 4 | Integration tests |

**Total: 48 test cases**

---

## Related Documentation

- [Migration System Documentation](./MIGRATION_SYSTEM_REMEDIATION.md)
- [Testing Environment Setup](./TESTING_ENV_SETUP.md)
