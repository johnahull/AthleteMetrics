# Organization Types E2E Tests

This document describes the comprehensive End-to-End test suite for the Organization Types feature in AthleteMetrics.

## Overview

The Organization Types feature allows different types of athletic organizations to be configured with appropriate metrics, benchmarks, and user experiences. This E2E test suite validates the complete workflow from organization creation through metrics filtering.

## Organization Types Supported

1. **Youth/Recreational** (`youth`) - Age-appropriate, limited metrics
2. **High School** (`high_school`) - Standard athletic metrics  
3. **College/University** (`college`) - Advanced/comprehensive metrics
4. **Club/Travel Team** (`club`) - Competitive metrics
5. **Private Training Facility** (`private_facility`) - Training-focused metrics
6. **Elite Academy** (`elite_academy`) - All advanced metrics

## Test Files

### 1. `organization-types-workflow.spec.ts`
**Comprehensive Workflow Testing**

Tests the complete organization types workflow including:

- **Organization Creation with Type Selection** (2 tests)
  - Create organizations with each organization type
  - Validate organization type is required during creation

- **Organization Type Filtering in Listings** (2 tests)
  - Filter organizations by type in listings
  - Display type badges correctly in organization listings

- **Organization Settings - Type Management** (2 tests)
  - Change organization type via settings page
  - Preserve organization type when updating other settings

- **Metrics and Benchmarks Integration** (2 tests)
  - Navigate to metrics page from organization with specific type
  - Navigate to benchmarks page from organization with specific type

- **User Journey and Access Control** (3 tests)
  - Maintain organization type context during navigation
  - Show access denied for org admin on organization settings
  - Allow site admin to switch organization context via listings

- **Visual and UI Verification** (2 tests)
  - Display organization types correctly in all UI contexts
  - Show correct organization type labels in all contexts

- **Data Validation and Error Handling** (2 tests)
  - Handle invalid organization type gracefully
  - Preserve organization type during concurrent settings updates

**Total: 15 test scenarios**

### 2. `organization-types-metrics-filtering.spec.ts`
**Metrics and Benchmarks Filtering Tests**

Tests organization type-based content filtering:

- **Metrics API Filtering** (2 tests)
  - Filter metrics based on organization type via API
  - Filter benchmarks based on organization type via API

- **UI-Based Filtering** (2 tests)
  - Show type-appropriate metrics in organization metrics page
  - Show type-appropriate benchmarks in organization benchmarks page

- **Consistency Validation** (2 tests)
  - Maintain consistent metrics across same organization types
  - Verify organization type affects available metrics count

- **Cross-Type Navigation** (2 tests)
  - Maintain proper context when switching between different organization types
  - Show appropriate error handling for unsupported metrics by organization type

**Total: 8 test scenarios**

## Test Environment Requirements

### Environment Variables

The tests require specific environment variables for role-based testing:

```bash
# Site Admin Credentials (required)
E2E_SITE_ADMIN_USERNAME=site-admin@athletemetrics.com
E2E_SITE_ADMIN_PASSWORD=secure_password

# Organization Admin Credentials (required)
E2E_ORG_ADMIN_USERNAME=org-admin@athletemetrics.com  
E2E_ORG_ADMIN_PASSWORD=secure_password

# Environment URLs
STAGING_URL=https://your-staging-environment.com
TESTING_URL=https://your-testing-environment.com
```

### Database Requirements

The staging/testing environment should have:

1. **Valid Organizations**: Organizations with different types for testing
2. **User Accounts**: Site admin and org admin accounts with proper permissions
3. **Metrics Data**: Some metrics and benchmarks configured for filtering tests
4. **Migration 0031**: The organization types database schema migration applied

## Running the Tests

### Run All Organization Types Tests

```bash
# Against staging environment
npm run test:staging tests/e2e/organization-types-*.spec.ts

# Against testing environment  
npm run test:testing tests/e2e/organization-types-*.spec.ts
```

### Run Specific Test Files

```bash
# Comprehensive workflow tests
npm run test:staging tests/e2e/organization-types-workflow.spec.ts

# Metrics filtering tests
npm run test:staging tests/e2e/organization-types-metrics-filtering.spec.ts
```

### Run with UI Mode (for debugging)

```bash
npx playwright test tests/e2e/organization-types-workflow.spec.ts --ui --config=playwright.staging.config.ts
```

### Run Specific Test Scenarios

```bash
# Test only organization creation
npx playwright test -g "Organization Creation" --config=playwright.staging.config.ts

# Test only metrics filtering
npx playwright test -g "Metrics API Filtering" --config=playwright.staging.config.ts
```

## Test Data Management

### Automatic Test Data Creation

The tests automatically create test organizations for each organization type:
- Names follow pattern: `E2E Test {Type Label} {Timestamp}`
- Each test run creates fresh test data to avoid conflicts

### Automatic Cleanup

The tests include cleanup logic that:
- Removes test organizations created during the test run
- Uses the delete organization workflow to ensure proper cleanup
- Handles cleanup failures gracefully

### Test Data Isolation

- Tests use unique timestamps to avoid naming conflicts
- Each test organization is clearly marked as test data
- Tests don't interfere with existing production-like data

## Expected Test Behavior

### Test Organization Creation
- Creates 6 organizations (one for each type)
- Verifies type selection works in creation form
- Validates form validation prevents creation without type

### Filtering Verification
- Tests type-based filtering in organization listings
- Verifies badges display correct labels for each type
- Tests API filtering for metrics and benchmarks

### Settings Integration
- Tests changing organization type via settings page
- Verifies only site admins can access organization settings
- Tests concurrent updates don't lose organization type

### Cross-Type Consistency
- Verifies organizations of same type have similar metrics
- Tests context switching between different organization types
- Validates proper error handling for restricted content

## Screenshots and Artifacts

Tests automatically capture:
- **Screenshots**: Saved to `test-results/` on failure
- **Visual Artifacts**: 
  - `org-types-listings.png` - Organization listings with type badges
  - `org-types-settings.png` - Organization type selector in settings
  - `metrics-{type}.png` - Metrics pages for different org types
  - `benchmarks-{type}.png` - Benchmarks pages for different org types
- **Traces**: Full interaction traces on test failure
- **Videos**: Screen recordings of failed tests

## Debugging Test Failures

### Common Issues

1. **Missing Environment Variables**
   ```
   Error: Missing credentials for role "site_admin"
   ```
   **Solution**: Set required E2E_SITE_ADMIN_USERNAME and E2E_SITE_ADMIN_PASSWORD

2. **Organization Not Found**
   ```
   Error: Test organization not found
   ```
   **Solution**: Check test organization creation succeeded in test setup

3. **Access Denied Errors**
   ```
   Error: Only site administrators can access organization settings
   ```
   **Solution**: Verify site admin credentials have proper permissions

4. **Metrics/Benchmarks Not Found**
   ```
   Error: No metrics found for organization type
   ```
   **Solution**: Check environment has metrics/benchmarks configured

### Debug Steps

1. **Run with UI Mode**: See live test execution
   ```bash
   npx playwright test --ui --config=playwright.staging.config.ts
   ```

2. **Check Screenshots**: Review `test-results/` folder for visual evidence

3. **Review Traces**: Open `.zip` trace files in Playwright trace viewer

4. **Verify Environment**: Run validation test first
   ```bash
   npm run test:staging:validate
   ```

## Integration with CI/CD

### Recommended Test Strategy

1. **Pull Request Tests**: Run workflow tests only
   ```bash
   npm run test:staging tests/e2e/organization-types-workflow.spec.ts
   ```

2. **Nightly Tests**: Run full organization types test suite
   ```bash
   npm run test:staging tests/e2e/organization-types-*.spec.ts
   ```

3. **Pre-Production**: Run all tests with additional browsers
   ```bash
   npm run test:staging
   ```

### Performance Considerations

- **Sequential Execution**: Tests use `test.describe.configure({ mode: 'serial' })` to avoid race conditions
- **Cleanup Efficiency**: Automatic cleanup prevents test data accumulation
- **Resource Management**: Tests limit concurrent organization creation

## Test Coverage Summary

✅ **Complete Organization Type Workflow** (23 scenarios)
- Organization creation and validation
- Settings page integration  
- Listing filtering and display
- User access control
- Visual verification
- Error handling

✅ **Metrics and Benchmarks Filtering** (8 scenarios)  
- API-based filtering
- UI content filtering
- Cross-type consistency
- Context switching

✅ **User Journey Coverage**
- Site admin complete workflow
- Organization admin access restrictions
- Type-specific content verification

This test suite provides comprehensive coverage of the Organization Types feature, ensuring the complete user experience works correctly across all supported organization types.