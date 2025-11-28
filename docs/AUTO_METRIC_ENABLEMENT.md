# Automatic Metric Enablement for New Organizations

## Overview

When a new organization is created, all active site metrics that are available to the organization's type are automatically enabled. This ensures that new organizations have immediate access to all applicable metrics without manual configuration.

## Implementation

### Changes Made

1. **Updated `storage.ts` - `createOrganization` method**:
   - Modified to use a database transaction
   - After creating the organization, queries all active site metrics that match the organization's type
   - Automatically creates `organization_metrics` entries for each applicable metric with `isEnabled: true`

2. **Created comprehensive integration tests**:
   - `tests/integration/organization-metrics-auto-enable.test.ts`
   - Tests verify:
     - All active site metrics are enabled for new organizations
     - Only metrics available to the organization type are enabled
     - Inactive metrics are not enabled

3. **Fixed vitest integration config**:
   - `vitest.integration.config.ts` was excluding `tests/integration/**` due to merge conflicts with base config
   - Changed to standalone config that doesn't merge with base to avoid exclude conflicts

## Behavior

### Metric Filtering Logic

When creating an organization, the system:

1. Gets all site metrics where:
   - `isActive = true`
   - `availableOrgTypes` is NULL (available to all) OR contains the organization's type

2. Creates `organization_metrics` entries for each qualifying metric with:
   - `organizationId`: The new organization's ID
   - `metricCode`: The site metric's code
   - `isEnabled`: true
   - `createdAt`: Current timestamp

### Example

```typescript
// Creating a "club" organization
const org = await storage.createOrganization({
  name: "My Club",
  orgType: "club",
  // ... other fields
});

// Automatically creates organization_metrics for:
// - All metrics with availableOrgTypes = NULL
// - All metrics with availableOrgTypes containing "club"
// - Only if the metric isActive = true
```

## Database Schema

### Tables Involved

- **organizations**: The main organization table
- **site_metrics**: Master catalog of all available metrics
- **organization_metrics**: Junction table linking organizations to enabled metrics

### Transaction Safety

The organization creation uses a database transaction to ensure atomicity:
- If organization creation fails, no metrics are created
- If metric enablement fails, the organization creation is rolled back
- This prevents partial states and maintains data integrity

## Testing

### Test Coverage

All scenarios are covered by integration tests:

1. **Basic enablement**: Verifies all active metrics are enabled
2. **Organization type filtering**: Verifies only applicable metrics are enabled
3. **Inactive metric exclusion**: Verifies inactive metrics are not enabled

### Running Tests

```bash
npm run test:integration -- organization-metrics-auto-enable
```

## Benefits

1. **Immediate Access**: New organizations have metrics enabled right away
2. **Consistency**: All organizations get the same baseline metrics
3. **Organization Type Awareness**: Respects organization-specific metric availability
4. **Admin Control**: Site admins can still manage which metrics are globally active
5. **No Manual Configuration**: Eliminates the need to manually enable metrics for each new organization

## Future Enhancements

Potential improvements that could be added:

1. Apply the same pattern to automatically enable benchmarks
2. Add org-type-specific default metric ordering
3. Add custom labels or display orders based on organization type
4. Allow site admins to configure default metric enablement templates

## Migration Impact

This change only affects newly created organizations. Existing organizations are not impacted and retain their current metric configurations.

## Related Files

- `/packages/api/storage.ts` - Organization creation logic
- `/packages/shared/schema.ts` - Database schema definitions
- `/tests/integration/organization-metrics-auto-enable.test.ts` - Integration tests
- `/vitest.integration.config.ts` - Test configuration fix
