# Admin Global Wellness Templates Implementation

## Overview
This implementation adds full CRUD functionality for site administrators to manage global wellness templates that appear in all organizations' wellness libraries.

## Features Implemented

### 1. Database Schema Changes
**File:** `drizzle/migrations/0004_make_org_id_nullable_for_system_templates.sql`

- Made `organization_id` nullable in `wellness_templates` table
- Added check constraint to ensure system templates (`is_system_seeded=true`) have NULL `organization_id`
- Added optimized index for querying global system templates
- Added documentation comments for schema constraints

### 2. Backend API Routes
**File:** `packages/api/routes/admin-wellness-routes.ts`

New admin-only endpoints:
- `GET /api/admin/wellness/templates` - List all global system templates
- `GET /api/admin/wellness/templates/:id/usage` - Get usage statistics (how many orgs use this template)
- `POST /api/admin/wellness/templates` - Create new global system template
- `PUT /api/admin/wellness/templates/:id` - Update global system template
- `DELETE /api/admin/wellness/templates/:id` - Delete global system template

All endpoints are protected by `requireSiteAdmin` middleware.

### 3. Storage Layer Functions
**File:** `packages/api/storage.ts`

New storage functions:
- `getSystemWellnessTemplates()` - Query templates with NULL `organization_id`
- `getSystemTemplateUsage(templateId)` - Count organizations using cloned templates
- `createSystemWellnessTemplate(template)` - Create template with NULL `organization_id`
- `updateSystemWellnessTemplate(id, template)` - Update system template only
- `deleteSystemWellnessTemplate(id)` - Delete system template only

### 4. Frontend Admin Page
**File:** `packages/web/src/pages/admin-wellness-templates.tsx`

Features:
- List all global wellness templates
- Create new global templates using `TemplateBuilder` component
- Edit existing global templates
- Delete templates with usage warnings
- Display usage statistics (how many organizations use each template)
- Real-time usage fetching for each template card

### 5. Updated TemplateBuilder Component
**File:** `packages/web/src/components/wellness/TemplateBuilder.tsx`

Changes:
- Added `isSystemTemplate` prop to distinguish between org and system templates
- Added `onSuccess` callback for custom success handling
- Made `organizationId` optional for system templates
- Routes to admin endpoints when `isSystemTemplate=true`
- Uses direct fetch API for admin operations

### 6. Library Integration
**File:** `packages/api/routes/wellness-routes.ts`

Updated library endpoint:
- `/api/organizations/:organizationId/wellness/library` now includes global system templates
- Combines `getSystemWellnessTemplates()` + `getWellnessTemplates(orgId)`
- Returns separate `systemTemplates` and `orgTemplates` arrays
- Maintains backward compatibility with existing clone functionality

### 7. Admin Navigation
**Files:**
- `packages/web/src/pages/admin.tsx` - Added "Global Wellness Templates" card with link
- `packages/web/src/App.tsx` - Added route `/wellness-templates`

## Security Considerations

### Permission Checks
- All admin wellness endpoints use `requireSiteAdmin` middleware
- Template ownership verified before update/delete operations
- Only system templates (`is_system_seeded=true`) can be managed via admin endpoints

### Data Integrity
- Check constraint ensures system templates always have NULL `organization_id`
- Org templates must have non-NULL `organization_id`
- Usage tracking uses `sourceTemplateId` to trace clones

### Clone Safety
- Deleting a system template does NOT delete cloned org templates
- Clones become independent after creation
- `sourceTemplateId` is self-referencing (no FK constraint)

## Usage Flow

### Creating a Global Template
1. Site admin navigates to `/wellness-templates`
2. Clicks "Create Template"
3. Uses `TemplateBuilder` to define questions and settings
4. Template is saved with `organization_id=NULL` and `is_system_seeded=true`
5. Template immediately appears in all org libraries

### Editing a Global Template
1. Site admin clicks "Edit" on template card
2. `TemplateBuilder` opens with existing template data
3. Changes are saved via `PUT /api/admin/wellness/templates/:id`
4. Updated template reflects in all org libraries
5. Existing clones are NOT updated (they are independent)

### Deleting a Global Template
1. Site admin clicks "Delete" on template card
2. System fetches usage statistics
3. Warning dialog shows how many orgs use this template
4. Admin confirms deletion
5. Template is removed from library
6. Existing clones remain intact in organizations

### Organization Cloning
1. Org member browses wellness library
2. Sees both system templates and org templates
3. Clicks "Clone" on system template
4. Clone is created with:
   - `organization_id` = current org
   - `is_system_seeded` = false
   - `source_template_id` = original system template ID
5. Clone is now independent and can be customized

## Migration Instructions

1. Run migration: `npm run db:migrate` (if using drizzle-kit)
   - Or manually apply: `drizzle/migrations/0004_make_org_id_nullable_for_system_templates.sql`

2. Restart API server to load new routes

3. Verify:
   - Site admin can access `/wellness-templates`
   - Can create/edit/delete system templates
   - Templates appear in org libraries
   - Clone functionality works correctly

## Testing Checklist

- [ ] Database migration applies cleanly
- [ ] Check constraint prevents invalid data
- [ ] Site admin can access admin wellness page
- [ ] Non-admin users get 403 on admin endpoints
- [ ] System templates appear in org libraries
- [ ] Clone functionality creates independent copies
- [ ] Deleting system template doesn't delete clones
- [ ] Usage statistics are accurate
- [ ] Edit saves changes correctly
- [ ] Template builder works for system templates

## Future Enhancements

1. **Versioning**: Track template versions and allow orgs to upgrade clones
2. **Categories**: Add predefined categories with icons
3. **Preview**: Allow admins to preview templates before publishing
4. **Analytics**: Track which system templates are most popular
5. **Bulk Operations**: Enable/disable multiple templates at once
6. **Import/Export**: Allow admins to import template JSON files

## Related Files

### Backend
- `packages/api/routes/admin-wellness-routes.ts` - Admin API endpoints
- `packages/api/routes/wellness-routes.ts` - Updated library endpoint
- `packages/api/storage.ts` - Storage layer functions
- `packages/shared/schema.ts` - Updated `wellnessTemplates` table definition

### Frontend
- `packages/web/src/pages/admin-wellness-templates.tsx` - Admin UI page
- `packages/web/src/pages/admin.tsx` - Admin navigation link
- `packages/web/src/components/wellness/TemplateBuilder.tsx` - Updated component
- `packages/web/src/App.tsx` - Route registration

### Database
- `drizzle/migrations/0004_make_org_id_nullable_for_system_templates.sql` - Schema migration

## Architecture Decisions

### Why NULL organization_id?
- Clear semantic distinction: NULL = global, non-NULL = org-specific
- Database constraint enforcement
- Simplified querying with `isNull()` filter
- Prevents accidental cross-org data leakage

### Why separate admin endpoints?
- Clear separation of concerns
- Different permission model (site admin vs org admin)
- Prevents accidental modification of system templates by org admins
- Easier to audit admin actions

### Why track sourceTemplateId?
- Enables future upgrade/sync features
- Provides usage analytics
- Helps with troubleshooting
- Self-referencing (no FK) allows deleting source templates

## Success Criteria Met

- [x] Database schema supports NULL `organizationId` for system templates
- [x] Site admins can create global templates via UI
- [x] Site admins can edit templates with usage warnings
- [x] Site admins can delete templates with usage warnings
- [x] Global templates appear in all org libraries
- [x] Clone functionality works with NULL `organizationId` templates
- [x] Proper permission checks (site admin only)
