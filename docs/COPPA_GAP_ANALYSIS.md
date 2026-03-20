# COPPA Implementation — Gap Analysis

**Branch:** `feature/coppa-compliance`
**Date:** 2026-03-02
**Status:** Core VPC flow complete; parental rights features and admin tooling incomplete

---

## What's Working

| Component | Status | Notes |
|-----------|--------|-------|
| Core VPC Flow | Complete | Initiate, verify, confirm, deny — all working |
| Email Templates | Complete | HTML + text for consent request and confirmation |
| Frontend Pages | Complete | Consent form, waiting page, registration integration |
| Login Blocking | Complete | Blocks pending_consent, needs_parent_email, consent_revoked |
| AI Access Checks | Complete | Fail-closed (`aiConsentGranted !== true`) |
| Report Snapshot Flags | Partial | Flags set at creation; enforcement on public access unclear |
| Audit Logging | Partial | Core actions logged; login blocks and resends missing |
| Test Coverage | Partial | Core flows tested; deletion, export, edge cases not tested |

---

## Critical Gaps (Ship Blockers)

### 1. Data Deletion Requests — Not Implemented

**Tables exist** (`dataDeletionRequests` in `packages/shared/schema/tables/coppa.ts:118`) but nothing populates or processes them.

**Missing:**
- `POST /api/coppa/data-deletion/request` — parent/admin initiates deletion
- `POST /api/coppa/data-deletion/process` — admin executes deletion
- Cascade delete logic (measurements, wellness responses, event registrations, reports, AI insights, OCR data)
- Notification email to parent when deletion completes
- Admin UI to manage deletion requests

**Legal exposure:** COPPA requires operators to delete a child's personal information upon parent request. Without this, the feature is non-compliant for production use.

---

### 2. Data Export Requests — Not Implemented

**Tables exist** (`dataExportRequests` in `packages/shared/schema/tables/coppa.ts:137`) but nothing populates or processes them.

**Missing:**
- `POST /api/coppa/data-export/request` — parent/admin initiates export
- Export builder (JSON + CSV of athlete data: profile, measurements, wellness, events, reports)
- One-time download token generation with hashing
- `GET /api/coppa/data-export/:downloadToken` — public download endpoint
- Expiry enforcement (`downloadExpiresAt` field is unused)
- Notification email when export is ready

**Legal exposure:** COPPA gives parents the right to review their child's collected data. Without export, parents cannot exercise this right.

---

### 3. Organization COPPA Settings — Not Enforced

`coppaEnabled` and `coppaContactEmail` exist in the org settings UI (`packages/web/src/pages/organization-settings.tsx:463-503`) but:

- Backend never checks `coppaEnabled` — the COPPA flow runs regardless of org setting
- `coppaContactEmail` is never used (not sent notifications on deletion/export requests)
- **Validation gap:** User can enable COPPA but leave contact email empty — FTC requires a compliance contact
- No warning when disabling COPPA for an org with pending consents

**Fix:** Make `coppaContactEmail` required when `coppaEnabled === true` (both frontend and backend validation).

---

### 4. Report Snapshot Public Access — Not Enforced

`publicAccessRestricted` flag is set at snapshot creation (`packages/api/services/report-service.ts:848-890`) but:

- The public share link endpoint doesn't clearly block access when `publicAccessRestricted === true`
- No user-facing error message explaining why a public link is blocked
- No admin UI to view/manage flagged snapshots

**Fix:** Add explicit 403 response with message when accessing a COPPA-restricted public snapshot.

---

## High Priority Gaps (Before Production)

### 5. Missing Audit Log Entries

Several COPPA actions are defined as constants but never logged:

| Action | Defined In | Logged? |
|--------|-----------|---------|
| `CONSENT_INITIATED` | coppa-utils.ts | Yes |
| `CONSENT_CONFIRMED` | coppa-utils.ts | Yes |
| `CONSENT_DENIED` | coppa-utils.ts | Yes |
| `CONSENT_REVOKED` | coppa-utils.ts | Yes |
| `AI_CONSENT_GRANTED` | coppa-utils.ts | Yes |
| `CONSENT_EMAIL_RESENT` | coppa-utils.ts | **No** — endpoint works but no audit entry |
| `LOGIN_BLOCKED_PENDING` | coppa-utils.ts | **No** — login blocks but doesn't log |
| `LOGIN_BLOCKED_REVOKED` | coppa-utils.ts | **No** — login blocks but doesn't log |
| `TOKEN_EXPIRED` | coppa-utils.ts | **No** — no cleanup job exists |

**Files to fix:**
- `packages/api/routes/auth-routes.ts` — add audit log after COPPA login blocks (line 43-51)
- `packages/api/routes/coppa-routes.ts` — add audit log after consent email resend (line 51)

---

### 6. Consent Token Expiry Cleanup — No Background Job

Expired tokens (30+ days old, still `pending`) accumulate in the database. No cron job or scheduled task marks them as `expired` or writes audit entries.

**Missing:** A daily job that:
1. Finds `parentalConsents` where `expiresAt < now()` and `status = 'pending'`
2. Updates status to `'expired'`
3. Writes `TOKEN_EXPIRED` audit log entries
4. Optionally notifies the athlete that consent was not completed in time

---

### 7. Org Admin COPPA Dashboard — No UI

The `GET /api/coppa/status/:athleteUserId` endpoint works, but there's no admin page to:

- View all athletes in org with COPPA status
- Filter by status (pending, consented, revoked, not_applicable)
- Revoke consent or AI-only consent
- View consent history and audit trail
- Manage data deletion/export requests

---

### 8. Parent Account System — Not Implemented

No `parent` user role exists. Parents interact only through email links. See the separate parent account plan for details on:

- Adding `parent` role to `ROLE_HIERARCHY`
- Parent registration (from consent confirmation page)
- Parent login and dashboard
- Link-based authorization (`requireParentAccess` middleware)
- Parent invitations from coaches/org admins
- Adding `parentUserId` FK to `parentAthleteLinks`

---

## Medium Priority Gaps

### 9. "Needs Parent Email" Workflow Incomplete

`coppaStatus: 'needs_parent_email'` is a valid state (set by retroactive scan when under-13 user has no parent email) but:

- No UI for the athlete to submit their parent's email
- No endpoint like `POST /api/coppa/consent/update-parent-email`
- Login is blocked but the user has no way to unblock themselves
- Retroactive scan sets this status (`packages/api/routes/coppa-routes.ts:304-309`) but there's no follow-up path

---

### 10. Consent Denial — No Recovery Path

When a parent denies consent:
- Athlete account stays inactive
- Login is blocked with `coppa_consent_revoked`
- But there's no way for the athlete to request re-consent
- No admin action to re-initiate consent
- No documentation of what happens next

**Should add:** Admin ability to re-initiate consent flow, or athlete self-service "request new consent" endpoint.

---

### 11. Missing Email Templates

| Template | Status |
|----------|--------|
| Parental consent request | Implemented |
| Consent confirmation (account activated) | Implemented |
| Deletion request confirmation | Missing |
| Deletion completed notification | Missing |
| Export ready to download | Missing |
| Export expiration reminder | Missing |
| AI consent revocation notice | Missing |
| Parent invitation (for parent account) | Missing |

---

## Frontend Bugs & UX Gaps

### 12. Stale Parent Email on DOB Change

**Files:** `packages/web/src/pages/register.tsx`, `packages/web/src/pages/accept-invitation.tsx`

If user enters a DOB making them under 13 (parent email field appears), fills in parent email, then changes DOB to 13+ (parent email field hides), the `parentEmail` value persists in form state and gets submitted.

**Fix:** Add effect to clear `parentEmail` when `isMinor` transitions from `true` to `false`.

---

### 13. Parental Consent Waiting Page — No Status Check

**File:** `packages/web/src/pages/parental-consent.tsx`

Any user can navigate to `/parental-consent` regardless of their `coppaStatus`. Should check status on mount and redirect if not in `pending_consent` state.

---

### 14. Hardcoded Expiry Duration

**File:** `packages/web/src/pages/consent-confirmation.tsx`

"30 days" is hardcoded in UI text (lines 101, 248) instead of importing `CONSENT_TOKEN_EXPIRY_DAYS` from `coppa-utils.ts`. Not a bug, but a maintenance risk if the constant changes.

---

## Security Observations

### Well-Implemented
- Token hashing (SHA-256, never stored plaintext)
- Timing-safe token validation (no enumeration)
- Atomic updates prevent token replay
- Fail-closed AI access checks
- Rate limiting on consent mutations (5/15min)
- Login blocking runs AFTER password validation (prevents account existence leaking)
- Audit logging captures IP and User-Agent
- 5-year retention enforcement on audit log

### Items to Review
- `parentEmail` stored in plaintext — consider if encryption is needed for COPPA
- Public consent endpoint rate limit (20/15min) may be too permissive for production
- No CAPTCHA on public consent form (low risk since token-gated)

---

## Test Coverage Gaps

### Tested
- All 6 COPPA route endpoints (`coppa-routes.test.ts`)
- Login blocking for all COPPA statuses (`auth-coppa.test.ts`)
- Age calculation and COPPA utilities (`coppa-utils.test.ts`)
- Registration with under-13 DOB (`registration-minor.test.ts`)

### Not Tested
- Data deletion request flow (not implemented)
- Data export request flow (not implemented)
- Token expiry cleanup (not implemented)
- Report snapshot COPPA flag enforcement
- Organization COPPA settings enforcement
- Consent email resend rate limiting
- Concurrent consent confirmation (race condition)
- DOB edge: Feb 29 birthday in non-leap year
- Athlete age changes during pending consent
- `needs_parent_email` → parent email collection → consent initiation flow

---

## Recommended Implementation Order

### Phase A — Ship Blockers (COPPA Legal Requirements)
1. Data deletion requests (endpoint + cascade delete + email)
2. Data export requests (endpoint + builder + download + email)
3. Report snapshot public access enforcement
4. Missing audit log entries (login blocks, email resends)

### Phase B — Admin Tooling
5. Org admin COPPA dashboard
6. Consent token expiry cleanup job
7. Organization COPPA settings enforcement
8. `needs_parent_email` collection workflow

### Phase C — Parent Accounts
9. `parent` role in role hierarchy
10. Parent registration from consent confirmation
11. Parent login + dashboard
12. Parent invitations
13. Link-based authorization middleware

### Phase D — Polish
14. Frontend bug fixes (stale parent email, status check)
15. Missing email templates
16. Consent denial recovery path
17. Audit log viewer UI
