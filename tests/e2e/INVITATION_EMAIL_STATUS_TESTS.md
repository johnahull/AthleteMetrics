# Invitation Email Status E2E Tests

## Overview

Comprehensive end-to-end tests for the invitation email status display feature, verifying email delivery indicators, CSRF token handling, and complete invitation workflows.

## Test File Location

`/home/hulla/devel/AthleteMetrics/tests/e2e/invitation-email-status.spec.ts`

## Test Coverage

### 1. Email Status Indicators ✅
**Test**: `should show green MailCheck icon for successful email delivery`

Tests the visual email status indicators:
- Green MailCheck icon (`data-testid="email-status-sent-{id}"`) for successful delivery
- Gray Mail icon (`data-testid="email-status-not-sent-{id}"`) for failed delivery
- Tooltip content verification on hover
- Handles both scenarios (sent/not-sent) gracefully in test environment

### 2. Email Status in Success Toast ✅
**Test**: `should show email status in success toast after invitation creation`

Verifies toast notification displays email delivery status:
- Success message includes email status
- Mentions "email sent" for successful delivery
- Mentions "email delivery failed" for failed delivery
- Toast appears within 5 seconds of form submission

### 3. Copy Invitation Link ✅
**Test**: `should successfully copy invitation link`

Tests the copy-to-clipboard functionality:
- Copy button (`data-testid="copy-invitation-{id}"`) is visible for all invitations
- Button click triggers clipboard copy
- Toast notification confirms copy success
- Link is valid and can be shared manually

### 4. Resend Expired Invitation ✅
**Test**: `should handle resend invitation for expired invitations`

Tests the resend invitation workflow:
- Resend button (`data-testid="resend-invitation-{id}"`) visible for expired invitations
- API call to `/api/invitations/{id}/resend` succeeds
- Toast notification confirms resend success
- Email status indicator updates after resend
- Handles case where no expired invitations exist (skips gracefully)

### 5. CSRF Token Handling ✅
**Test**: `should not show CSRF token errors during invitation mutations`

Verifies CSRF token protection works correctly:
- No 403 errors during invitation creation
- No console errors mentioning "CSRF" or "token missing"
- Network requests include proper CSRF tokens
- Mutations succeed without authentication issues

### 6. Invitation Creation via Modal ✅
**Test**: `should create invitation via InvitationModal component`

Tests the complete invitation creation workflow:
- Modal opens with "Manage Users" button (`data-testid="button-manage-users"`)
- Tabs allow switching to "Send Invitation"
- Form fields are visible and functional:
  - First Name: `data-testid="input-invite-first-name"`
  - Last Name: `data-testid="input-invite-last-name"`
  - Email: `data-testid="input-invite-email"`
  - Role: `data-testid="select-invite-role"`
- Submit button: `data-testid="button-send-invitation"`
- API response includes invitation ID and email status
- Modal closes after successful submission
- Invitation appears in pending invitations list

### 7. Form Validation - Required Fields ✅
**Test**: `should show validation errors for empty invitation form`

Tests required field validation:
- Submitting empty form shows validation errors
- Modal remains open (form not submitted)
- Error messages mention "required", "must", or "invalid"
- At least one validation error is visible

### 8. Form Validation - Email Format ✅
**Test**: `should show validation error for invalid email format`

Tests email format validation:
- Invalid email format (e.g., "invalid-email-format") triggers error
- Error message mentions "invalid email", "valid email", or "email format"
- Form not submitted until email is valid

## Data Test IDs Added

### Organization Profile Component
- `data-testid="button-manage-users"` - Opens user management modal
- `data-testid="email-status-sent-{invitationId}"` - Green MailCheck icon
- `data-testid="email-status-not-sent-{invitationId}"` - Gray Mail icon
- `data-testid="email-status-tooltip-{invitationId}"` - Tooltip content
- `data-testid="copy-invitation-{invitationId}"` - Copy link button
- `data-testid="resend-invitation-{invitationId}"` - Resend button
- `data-testid="delete-pending-{invitationId}"` - Delete pending invitation

### Invitation Form (UserManagementModal)
- `data-testid="input-invite-first-name"` - First name input
- `data-testid="input-invite-last-name"` - Last name input
- `data-testid="input-invite-email"` - Email input
- `data-testid="select-invite-role"` - Role selector
- `data-testid="button-send-invitation"` - Submit button

## Test Prerequisites

### Environment Variables
Tests use the following environment detection:
```bash
# Testing environment (preferred)
TESTING_URL=https://athletemetrics-testing.up.railway.app
TESTING_USERNAME=your-test-org-admin-username
TESTING_PASSWORD=your-test-password

# OR Staging environment (fallback)
STAGING_URL=https://your-staging-url.com
STAGING_USERNAME=your-staging-username
STAGING_PASSWORD=your-staging-password

# For role-based testing (optional)
E2E_ORG_ADMIN_USERNAME=org-admin-username
E2E_ORG_ADMIN_PASSWORD=org-admin-password
```

### Required User Roles
Tests require an **org_admin** user with:
- Access to at least one organization
- Permission to create invitations
- Permission to view pending invitations

## Running the Tests

### Run all invitation email status tests
```bash
# Using testing environment
npm run test:testing -- tests/e2e/invitation-email-status.spec.ts

# Using staging environment
npm run test:staging -- tests/e2e/invitation-email-status.spec.ts
```

### Run specific test
```bash
npx playwright test tests/e2e/invitation-email-status.spec.ts \
  --config=playwright.testing.config.ts \
  --grep "should show green MailCheck icon"
```

### Run with UI (debugging)
```bash
npx playwright test tests/e2e/invitation-email-status.spec.ts \
  --config=playwright.testing.config.ts \
  --ui
```

### Run with headed browser
```bash
npx playwright test tests/e2e/invitation-email-status.spec.ts \
  --config=playwright.testing.config.ts \
  --headed
```

## Test Data Management

### Automatic Cleanup
Tests automatically clean up created invitations:
- Captures invitation IDs from API responses
- Deletes test invitations in `afterEach()` hook
- Prevents database pollution from test runs

### Test Data Generation
Uses timestamp-based unique identifiers:
```typescript
function generateTestInvitation() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    firstName: `TestInvite_${uniqueId}`,
    lastName: `LastName_${uniqueId}`,
    email: `test_invite_${uniqueId}@example.com`,
  };
}
```

## Expected Test Results

### All Tests Passing ✅
```
✅ should show green MailCheck icon for successful email delivery
✅ should show email status in success toast after invitation creation
✅ should successfully copy invitation link
✅ should handle resend invitation for expired invitations
✅ should not show CSRF token errors during invitation mutations
✅ should create invitation via InvitationModal component
✅ should show validation errors for empty invitation form
✅ should show validation error for invalid email format
✅ print invitation email status test summary
```

### Test Summary Output
```
═══════════════════════════════════════════════════
Invitation Email Status Tests Summary
═══════════════════════════════════════════════════
✅ Email status indicators (MailCheck/Mail icons)
✅ Email status in success toast
✅ Copy invitation link functionality
✅ Resend expired invitation workflow
✅ CSRF token handling (no 403 errors)
✅ Invitation creation via modal
✅ Form validation - required fields
✅ Form validation - email format
═══════════════════════════════════════════════════
```

## Troubleshooting

### Test fails: "Could not find organization link for org admin"
**Solution**: Ensure the test user has org_admin role and access to at least one organization.

### Test fails: "button-manage-users not found"
**Solution**: Verify the user has permission to manage users (org_admin or site_admin role).

### Test fails: Email status indicators not found
**Solution**:
1. Verify the organization-profile.tsx component includes the data-testid attributes
2. Ensure the invitation was successfully created (check API response)
3. Check that the page has fully loaded before looking for indicators

### Test fails: Copy to clipboard
**Solution**:
1. Ensure the browser has clipboard permissions in the test environment
2. Verify the copy button is visible (may need to wait for invitation to appear)
3. Check browser console for clipboard API errors

### Test skips: Resend invitation test
**Solution**: This test gracefully skips if no expired invitations exist. To force testing:
1. Create an invitation manually with past expiration date
2. Use database migration to set expiration date in the past
3. Wait for an existing invitation to expire naturally

## Integration with CI/CD

### GitHub Actions Example
```yaml
- name: Run Invitation Email Status E2E Tests
  env:
    TESTING_URL: ${{ secrets.TESTING_URL }}
    TESTING_USERNAME: ${{ secrets.TESTING_USERNAME }}
    TESTING_PASSWORD: ${{ secrets.TESTING_PASSWORD }}
    E2E_ORG_ADMIN_USERNAME: ${{ secrets.E2E_ORG_ADMIN_USERNAME }}
    E2E_ORG_ADMIN_PASSWORD: ${{ secrets.E2E_ORG_ADMIN_PASSWORD }}
  run: npm run test:testing -- tests/e2e/invitation-email-status.spec.ts
```

## Related Documentation

- [Testing Environment Setup](../../TESTING_ENV_SETUP.md)
- [E2E Test Patterns](./README.md)
- [Authentication Helpers](./helpers/auth.ts)
- [Navigation Helpers](./helpers/navigation.ts)

## Files Modified

### Component Changes
1. `/home/hulla/devel/AthleteMetrics/packages/web/src/pages/organization-profile.tsx`
   - Added `data-testid` attributes to email status indicators
   - Added `data-testid` to "Manage Users" button
   - Added `data-testid` to tooltip content

### Test Files
1. `/home/hulla/devel/AthleteMetrics/tests/e2e/invitation-email-status.spec.ts` (NEW)
   - 8 comprehensive test cases
   - Automatic cleanup of test data
   - Role-based authentication

### Helper Functions
1. `/home/hulla/devel/AthleteMetrics/tests/e2e/helpers/navigation.ts`
   - Added `goToOrganizationProfile()` helper function

## Success Criteria

All tests must pass before merging to main:
- ✅ Email status indicators display correctly
- ✅ CSRF tokens work without errors
- ✅ Copy link functionality works
- ✅ Resend invitation workflow succeeds
- ✅ Form validation works as expected
- ✅ No console errors during invitation operations
- ✅ Test data is properly cleaned up

## Maintenance Notes

### Keeping Tests Up to Date
- If invitation API changes, update response handling in tests
- If UI components change, update data-testid selectors
- If validation rules change, update validation test assertions
- Review test data cleanup logic if invitation deletion API changes

### Performance Considerations
- Tests run in parallel by default (Playwright workers)
- Each test is independent and can run in any order
- Cleanup runs after each test to prevent conflicts
- Tests use unique email addresses to avoid conflicts

### Future Enhancements
- Add visual regression testing for email status icons
- Test email content verification (if SendGrid API accessible)
- Add tests for bulk invitation operations
- Test email status for athlete invitations (separate workflow)

## Contact

For questions or issues with these tests:
- Review test output in Playwright HTML report
- Check console logs for detailed error messages
- Verify environment variables are correctly set
- Ensure testing environment is accessible and running
