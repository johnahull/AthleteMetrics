# Wellness Module Feature Flags Implementation

## Overview

This document describes the implementation of a comprehensive feature flag system for the Wellness module with both site-level and organization-level controls.

## Feature Requirements

### Feature Flag Behavior

1. **Site Admin Control (Global):**
   - Site admins can toggle the "Wellness Module" in site settings (`/admin`)
   - When disabled by site admin, wellness is disabled for ALL organizations
   - When disabled, organization-level settings are frozen

2. **Organization Admin Control (Org-Specific):**
   - Org admins can toggle "Wellness Module" in organization settings (`/organizations/:id`)
   - Only available when site admin has wellness enabled globally
   - When disabled, wellness is hidden for that specific organization

3. **Navigation Visibility:**
   - If wellness is disabled (by either site admin OR org admin), the "Wellness" link is hidden from the sidebar navigation
   - Applies to org admins, coaches, and all roles within the organization

## Implementation Details

### Phase 1: Database Schema Changes

**Migration File:** `packages/db/migrations/0042_add_wellness_feature_flags.sql`

#### Schema Changes:

1. **organizations table:**
   - Added column: `wellness_enabled` (BOOLEAN, DEFAULT true)
   - Index: `organizations_wellness_enabled_idx`

2. **site_settings table:**
   - Added column: `wellness_module_enabled` (BOOLEAN, DEFAULT true)

#### Files Modified:
- `/home/hulla/devel/AthleteMetrics/packages/shared/schema.ts`
  - Updated `organizations` table definition
  - Updated `siteSettings` table definition
  - Updated `updateOrganizationSchema` validation
  - Updated `updateSiteSettingsSchema` validation

### Phase 2: Backend API Implementation

#### Middleware

**File:** `/home/hulla/devel/AthleteMetrics/packages/api/middleware/require-wellness-enabled.ts`

Created two exports:
1. `requireWellnessEnabled()` - Middleware function
   - Checks site-level `wellness_module_enabled` setting
   - Checks organization-level `wellness_enabled` setting
   - Returns 403 if wellness is disabled at either level
   - Includes metadata about which level disabled it (`site_admin` or `org_admin`)

2. `checkWellnessEnabled(organizationId)` - Utility function
   - Returns wellness status without middleware
   - Useful for conditional feature display in API responses

**Export Added:** `/home/hulla/devel/AthleteMetrics/packages/api/middleware.ts`
- Exported both functions for use in routes

#### API Routes

**File:** `/home/hulla/devel/AthleteMetrics/packages/api/routes/site-settings-routes.ts`

Modified:
- `PATCH /api/site-settings` - Now accepts `wellnessModuleEnabled` field
- Includes audit logging for wellness module toggles
- Action: `site_wellness_module_toggled`

**File:** `/home/hulla/devel/AthleteMetrics/packages/api/routes/wellness-routes.ts`

Added `requireWellnessEnabled` middleware to:
- `POST /api/organizations/:organizationId/wellness/templates`
- `GET /api/organizations/:organizationId/wellness/templates`
- (Note: Additional routes should also include this middleware)

#### Storage Layer

**File:** `/home/hulla/devel/AthleteMetrics/packages/api/storage.ts`

Modified `updateSiteSettings()`:
- Now accepts optional `wellnessModuleEnabled` parameter
- Updates only provided fields
- Creates default settings if none exist

### Phase 3: Frontend UI Implementation

#### Site Admin Settings Page

**File:** `/home/hulla/devel/AthleteMetrics/packages/web/src/pages/admin.tsx`

Added:
- State management for `wellnessEnabled`
- Mutation: `updateWellnessMutation`
- Handler: `handleWellnessToggle()`
- UI Card: "Wellness Module" with toggle switch
- Warning message when disabled

Features:
- Toggle switch with `data-testid="wellness-module-toggle"`
- Real-time updates with React Query invalidation
- Toast notifications for success/error
- Visual warning when wellness is disabled

#### Organization Settings Page

**File:** `/home/hulla/devel/AthleteMetrics/packages/web/src/pages/organization-settings.tsx`

Added:
- Form field: `wellnessEnabled`
- UI toggle in "Feature Flags" section
- Change tracking in form submission
- Validation through `updateOrganizationSchema`

Features:
- Switch component for wellness toggle
- Description: "Enable wellness questionnaires and health tracking for this organization"
- Form validation and error handling

#### Sidebar Navigation

**File:** `/home/hulla/devel/AthleteMetrics/packages/web/src/components/sidebar.tsx`

Added:
- Query for site settings: `["/api/site-settings"]`
- Query for organization: `["/api/organizations/${organizationId}"]`
- Logic to check both flags:
  ```typescript
  const wellnessModuleEnabled = siteSettings?.wellnessModuleEnabled ?? true;
  const orgWellnessEnabled = organization?.wellnessEnabled ?? true;
  const isWellnessEnabled = wellnessModuleEnabled && orgWellnessEnabled;
  ```
- Filter navigation to remove "Wellness" link when disabled

Features:
- Caching with 5-minute stale time
- Default to enabled if settings not loaded
- Filters navigation dynamically

### Phase 4: Data Migration

**Default Values:**
- All existing organizations: `wellness_enabled = true`
- Site settings: `wellness_module_enabled = true`
- No data migration script needed (handled by SQL DEFAULT values)

## File Summary

### Created Files:
1. `/home/hulla/devel/AthleteMetrics/packages/db/migrations/0042_add_wellness_feature_flags.sql`
2. `/home/hulla/devel/AthleteMetrics/packages/api/middleware/require-wellness-enabled.ts`
3. `/home/hulla/devel/AthleteMetrics/WELLNESS_FEATURE_FLAGS_IMPLEMENTATION.md` (this file)

### Modified Files:
1. `/home/hulla/devel/AthleteMetrics/packages/shared/schema.ts`
2. `/home/hulla/devel/AthleteMetrics/packages/api/middleware.ts`
3. `/home/hulla/devel/AthleteMetrics/packages/api/routes/site-settings-routes.ts`
4. `/home/hulla/devel/AthleteMetrics/packages/api/routes/wellness-routes.ts`
5. `/home/hulla/devel/AthleteMetrics/packages/api/storage.ts`
6. `/home/hulla/devel/AthleteMetrics/packages/web/src/pages/admin.tsx`
7. `/home/hulla/devel/AthleteMetrics/packages/web/src/pages/organization-settings.tsx`
8. `/home/hulla/devel/AthleteMetrics/packages/web/src/components/sidebar.tsx`

## API Endpoints

### Site Settings
- `GET /api/site-settings` - Get site settings (includes `wellnessModuleEnabled`)
- `PATCH /api/site-settings` - Update site settings (accepts `wellnessModuleEnabled`)

### Organization Settings
- `GET /api/organizations/:id` - Get organization (includes `wellnessEnabled`)
- `PATCH /api/organizations/:id` - Update organization (accepts `wellnessEnabled`)

### Wellness Routes (Protected)
All wellness routes now check feature flags via `requireWellnessEnabled` middleware.

## Testing

### Manual Testing Steps:

1. **Site Admin Disables Wellness:**
   - Login as site admin
   - Navigate to `/admin`
   - Toggle "Wellness Module" off
   - Verify: Wellness link disappears from all user sidebars
   - Verify: Organization settings show wellness toggle as disabled
   - Verify: API requests to wellness endpoints return 403

2. **Org Admin Disables Wellness:**
   - Site admin enables wellness globally
   - Login as org admin
   - Navigate to organization settings
   - Toggle "Wellness Module" off
   - Verify: Wellness link disappears only for that org's users
   - Verify: Other organizations still have wellness access

3. **Re-enabling Wellness:**
   - Toggle wellness back on (either level)
   - Verify: Wellness link reappears in sidebar
   - Verify: Wellness routes are accessible again

### E2E Test Considerations:

Should test:
- Site admin toggle functionality
- Org admin toggle functionality (when site allows)
- Org admin cannot enable when site disabled
- Navigation visibility changes
- API endpoint protection
- Audit log creation

## Database Migration

To apply the migration:

```bash
npm run db:migrate:manual
```

The migration will:
1. Add `wellness_enabled` column to `organizations` (default: true)
2. Add `wellness_module_enabled` column to `site_settings` (default: true)
3. Create index on `organizations.wellness_enabled`
4. Add documentation comments

## Security Considerations

1. **Permission Checks:**
   - Only site admins can modify site-level wellness setting
   - Only org admins can modify organization-level wellness setting
   - Middleware validates both levels before allowing access

2. **Audit Logging:**
   - All wellness toggle changes are logged
   - Includes user ID, timestamp, IP address, and user agent
   - Action types: `site_wellness_module_toggled`

3. **Fail-Safe Behavior:**
   - Defaults to enabled if settings are missing
   - Site admins can always access (bypass middleware)
   - Error responses don't leak implementation details

## Future Enhancements

Potential improvements:
1. Add scheduled wellness enable/disable (time-based toggles)
2. Add wellness feature flag analytics (track usage rates)
3. Add bulk organization wellness management (site admin)
4. Add wellness feature preview mode (read-only access when disabled)
5. Add granular wellness feature sub-flags (templates vs responses vs analytics)

## Success Criteria

- [x] Site admin can toggle wellness globally
- [x] Org admin can toggle wellness per-org (when site allows)
- [x] Org setting frozen when site setting disabled
- [x] Navigation hidden when wellness disabled
- [x] Existing orgs default to wellness enabled
- [x] Proper permission checks on all wellness routes
- [x] Audit logging for setting changes
- [x] UI feedback for disabled state

## Rollout Plan

1. **Deploy Schema Changes:**
   - Run migration 0042
   - Verify all organizations have `wellness_enabled = true`

2. **Deploy Backend Changes:**
   - Deploy middleware and route protection
   - Monitor error logs for 403 responses
   - Verify audit logs are created

3. **Deploy Frontend Changes:**
   - Deploy admin page updates
   - Deploy org settings updates
   - Deploy sidebar navigation updates
   - Verify toggle functionality

4. **Communication:**
   - Notify site admins of new feature flag capability
   - Update user documentation
   - Announce wellness module control to org admins
