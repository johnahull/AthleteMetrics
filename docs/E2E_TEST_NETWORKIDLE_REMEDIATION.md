# E2E Test NetworkIdle Remediation Plan

## Issue Summary

**Status:** 🔴 **CRITICAL - Test Flakiness Risk**

The E2E test suite contains **120 instances** of `waitForLoadState('networkidle')` across test files, which creates reliability issues:

### Why NetworkIdle Is Problematic

1. **React Query Background Refetches**: React Query may refetch data after the page appears "idle", causing tests to proceed before data is actually loaded
2. **WebSocket Heartbeats**: Any WebSocket connections will prevent "idle" state
3. **Timing Variability**: Network conditions can cause unpredictable wait times (500-2000ms+ dead time per wait)
4. **False Positives**: Tests may pass locally but fail in CI due to network variations

### Impact

- **Test Reliability**: Random CI failures that are hard to reproduce
- **Test Performance**: Unnecessary waiting adds ~5-15 minutes to test suite runtime
- **Maintenance**: Flaky tests require investigation and re-runs

---

## Recommended Solutions

### Option 1: Data-TestID Markers (Best Practice) ✅

Add explicit loading state markers to React components:

```typescript
// In React component
{isLoading && <div data-testid="athletes-loading">Loading...</div>}
{!isLoading && <div data-testid="athletes-loaded">...</div>}

// In test
await page.waitForSelector('[data-testid="athletes-loaded"]', { timeout: 5000 });
```

**Pros:**
- Explicit intent
- Fast and reliable
- No coupling to implementation details
- Works across all network conditions

**Cons:**
- Requires frontend changes
- More work upfront

### Option 2: Element Count Stabilization

Wait for element count to stabilize using `expect().toPass()`:

```typescript
await expect(async () => {
  const count = await page.locator('[data-testid^="checkbox-athlete-"]').count();
  expect(count).toBeGreaterThan(0);
}).toPass({ timeout: 5000 });
```

**Pros:**
- No frontend changes needed
- Robust to refetches
- Clear assertion intent

**Cons:**
- Slightly more verbose
- May wait full timeout if elements never appear

### Option 3: API Response Waits

Wait for specific API responses instead of page state:

```typescript
const responsePromise = page.waitForResponse(resp =>
  resp.url().includes('/api/athletes') && resp.status() === 200
);
await page.click('[data-testid="load-athletes-button"]');
await responsePromise;
```

**Pros:**
- Precise timing
- No frontend changes
- Tests actual data flow

**Cons:**
- Couples tests to API structure
- Doesn't verify UI rendering

---

## Current Status by File

### Files with NetworkIdle Usage

| File | Instances | Priority |
|------|-----------|----------|
| `permissions.spec.ts` | 35 | 🔴 High |
| `athlete-crud.spec.ts` | 18 | 🔴 High |
| `csv-import.spec.ts` | 22 | 🔴 High |
| `measurement-entry.spec.ts` | 15 | 🟡 Medium |
| `auth-flows.spec.ts` | 12 | 🟡 Medium |
| Others | 18 | 🟢 Low |

### Already Documented Issues

The following test files have comments acknowledging the networkidle issue:

- `athlete-crud.spec.ts:44-49` - "NOTE: waitForLoadState('networkidle') usage... Future optimization: Add data-testid="athletes-loaded" marker"

---

## Action Plan

### Phase 1: Frontend Loading States (Recommended)

**Effort:** 2-4 hours
**Impact:** Eliminates 80%+ of flakiness

1. Add loading state markers to key components:
   - `packages/web/src/pages/athletes.tsx` - Add `data-testid="athletes-loaded"`
   - `packages/web/src/pages/measurements.tsx` - Add `data-testid="measurements-loaded"`
   - `packages/web/src/pages/import-export.tsx` - Add `data-testid="import-ready"`
   - Modal components - Add `data-testid="modal-content-ready"`

2. Replace networkidle with explicit checks:
   ```typescript
   // Before
   await page.waitForLoadState('networkidle');

   // After
   await page.waitForSelector('[data-testid="athletes-loaded"]');
   ```

### Phase 2: Test File Updates

**Priority Order:**

1. **High Priority** (Block merge):
   - `athlete-crud.spec.ts` - Core CRUD operations
   - `csv-import.spec.ts` - Data integrity tests
   - `permissions.spec.ts` - Security tests

2. **Medium Priority** (Next sprint):
   - `measurement-entry.spec.ts`
   - `auth-flows.spec.ts`

3. **Low Priority** (Tech debt):
   - Remaining files

### Phase 3: Test Helper Function

Create a reusable helper to replace networkidle:

```typescript
// tests/e2e/helpers/wait.ts
export async function waitForPageReady(
  page: Page,
  selector: string = '[data-testid*="-loaded"]'
) {
  await page.waitForSelector(selector, { timeout: 10000 });

  // Optional: Also wait for no pending React Query mutations
  await page.waitForFunction(() => {
    return (window as any).__REACT_QUERY_CACHE__?.mutationCache?.getAll()
      .filter(m => m.state.status === 'pending').length === 0;
  }, { timeout: 5000 }).catch(() => {
    // Gracefully fallback if React Query not exposed
  });
}
```

---

## Migration Examples

### Before (Flaky)

```typescript
test('should load athletes', async ({ page }) => {
  await page.goto('/athletes');
  await page.waitForLoadState('networkidle');  // ❌ FLAKY

  const athleteCount = await page.locator('[data-testid^="athlete-row-"]').count();
  expect(athleteCount).toBeGreaterThan(0);
});
```

### After (Stable)

```typescript
test('should load athletes', async ({ page }) => {
  await page.goto('/athletes');
  await page.waitForSelector('[data-testid="athletes-loaded"]');  // ✅ STABLE

  const athleteCount = await page.locator('[data-testid^="athlete-row-"]').count();
  expect(athleteCount).toBeGreaterThan(0);
});
```

### Alternative: Element Stabilization

```typescript
test('should load athletes', async ({ page }) => {
  await page.goto('/athletes');

  // Wait for count to stabilize (handles refetches gracefully)
  await expect(async () => {
    const count = await page.locator('[data-testid^="athlete-row-"]').count();
    expect(count).toBeGreaterThan(0);
  }).toPass({ timeout: 10000 });  // ✅ STABLE
});
```

---

## Testing the Changes

### Verify Stability

Run tests multiple times to ensure reliability:

```bash
# Run same test 10 times to check for flakiness
for i in {1..10}; do
  npx playwright test athlete-crud.spec.ts --config=playwright.staging.config.ts
done
```

### Performance Comparison

Before:
- Test runtime: ~45 minutes
- Flake rate: ~5-10% (estimated)

After (expected):
- Test runtime: ~30-35 minutes (25% improvement)
- Flake rate: <1%

---

## References

- [Playwright Best Practices - Auto-waiting](https://playwright.dev/docs/actionability)
- [Testing Library - waitFor](https://testing-library.com/docs/dom-testing-library/api-async/#waitfor)
- [React Query - Testing](https://tanstack.com/query/latest/docs/framework/react/guides/testing)

---

## Status Tracking

- [ ] **Phase 1**: Add frontend loading markers (2-4 hours)
- [ ] **Phase 2**: Update high-priority test files (4-6 hours)
- [ ] **Phase 3**: Create test helper functions (1-2 hours)
- [ ] **Verification**: Run tests 10x to confirm stability (30 minutes)

**Total Estimated Effort:** 8-13 hours

---

**Last Updated:** 2025-10-30
**Status:** Documented - Awaiting Implementation
**Owner:** TBD
