# Invitation System - Known Issues and TODOs

## Performance Issues

### 1. Inefficient Invitation Retrieval (HIGH PRIORITY)
**Location:** `server/routes.ts` lines 2818, 2919, 3238, 3375
**Issue:** Multiple endpoints call `storage.getInvitations()` which retrieves ALL invitations from the database, then filters in memory.
**Impact:** Poor performance with many invitations. O(n) memory usage.
**Solution:** Add `storage.getInvitationById(id)` method to BaseService that queries by ID directly.

```typescript
// Current (inefficient):
const allInvitations = await storage.getInvitations();
const invitation = allInvitations.find(inv => inv.id === invitationId);

// Should be:
const invitation = await storage.getInvitationById(invitationId);
```

## Security Issues

### 2. Hardcoded Admin Username Lookup
**Location:** `server/routes.ts` line 2614
**Issue:** Code assumes an "admin" user exists when req.session.user is not available
**Impact:** Will fail if admin user doesn't exist or has different username
**Solution:** Use site admin detection or require proper authentication

```typescript
// Current:
const siteAdmin = await storage.getUserByUsername("admin");
invitedById = siteAdmin?.id;

// Should be:
return res.status(401).json({ message: "Authentication required" });
```

### 3. Potential Username Enumeration via Timing Attack
**Location:** `server/routes.ts` line 3232-3234
**Issue:** Username check could leak information about existing usernames through response timing
**Impact:** Low - attacker could enumerate valid usernames
**Solution:** Use constant-time comparison or add deliberate delay

### 4. Missing CSRF Token on Accept Endpoint
**Location:** `server/routes.ts` line 384-390
**Issue:** `/invitations/:token/accept` is in CSRF skip list
**Impact:** This is acceptable since the endpoint uses single-use tokens
**Status:** This is actually correct design - documented for clarity

## Data Validation Issues

### 5. No Validation of Team IDs
**Location:** `server/routes.ts` lines 2650, 2747
**Issue:** `teamIds` array is accepted without validating that teams exist
**Impact:** Could create invitations with invalid team references
**Solution:** Add validation to check that all teamIds exist in the database

```typescript
if (teamIds && teamIds.length > 0) {
  const teams = await storage.getTeamsByIds(teamIds);
  if (teams.length !== teamIds.length) {
    return res.status(400).json({ message: "One or more team IDs are invalid" });
  }
}
```

### 6. No Validation of Organization Existence (Partial)
**Location:** `server/routes.ts` line 2730-2733
**Issue:** Only regular invitations validate org exists, athlete invitations don't
**Impact:** Could create invitations for non-existent organizations
**Solution:** Add consistent validation for all invitation types

## Race Condition Risks

### 7. Concurrent Invitation Acceptance
**Location:** `server/routes.ts` line 3247-3252
**Issue:** Two users could potentially accept the same invitation simultaneously
**Impact:** Low probability but could create duplicate accounts
**Solution:** Use database transaction with SELECT FOR UPDATE or optimistic locking

## Email Handling

### 8. Email Send Failures Don't Rollback Creation
**Location:** `server/routes.ts` lines 2678-2695
**Issue:** If email fails to send, invitation is still created but emailSent is false
**Impact:** User experience issue - invitation exists but user never receives it
**Status:** This is actually acceptable - admins can resend. Documented for clarity.

### 9. No Email Delivery Retry Logic
**Location:** `server/services/email-service.ts`
**Issue:** Failed email sends are logged but not retried
**Impact:** Transient email service failures result in un-sent invitations
**Solution:** Implement retry queue or background job system

## Code Quality

### 10. Duplicate Code for Email Sending
**Location:** `server/routes.ts` lines 2667-2697, 2756-2774, 2853-2877
**Issue:** Similar email sending logic is duplicated across endpoints
**Impact:** Maintainability - changes need to be made in multiple places
**Solution:** Extract to shared function

```typescript
async function sendInvitationEmail(invitation, invitedById, req) {
  // Shared logic
}
```

## Test Coverage Gaps

### 11. Missing Integration Tests
**Issue:** Current tests use mocks extensively but don't test actual HTTP endpoints
**Impact:** Could miss integration issues
**Solution:** Add supertest-based integration tests for critical paths

### 12. Missing Edge Case Tests
**Tests needed:**
- Concurrent acceptance attempts
- Invitation with expired organization
- Invitation with deleted team IDs
- Rate limiting edge cases
- Session fixation prevention

## Future Enhancements

### 13. Add Invitation Templates
**Feature:** Allow organizations to customize invitation email templates
**Priority:** Low
**Complexity:** Medium

### 14. Add Invitation Expiry Notifications
**Feature:** Email users when their invitations are about to expire
**Priority:** Low
**Complexity:** Low

### 15. Add Bulk Invitation Import
**Feature:** Upload CSV to send invitations to multiple users
**Priority:** Medium
**Complexity:** High

## Testing Checklist

- [x] Unit tests for invitation creation
- [x] Unit tests for invitation acceptance
- [x] Unit tests for resend/cancel
- [x] Unit tests for email service
- [x] Security tests for audit logging
- [x] Security tests for attempt tracking
- [ ] Integration tests with real HTTP requests
- [ ] Performance tests with large invitation datasets
- [ ] Concurrency tests for race conditions

## Notes

This document was generated during comprehensive code review and testing of the invitation system on branch `feat/invitation-enable`.

Date: 2025-10-05
