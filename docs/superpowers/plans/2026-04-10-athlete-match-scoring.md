# Athlete Match Scoring Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix athlete match classification so that exact name matches score as "exact" (not "partial") when no team context is available, and add "partial" to the wizard summary counts.

**Architecture:** Normalize the raw match score against the maximum achievable score before applying thresholds. Without team context the max is 70 pts (30 first name + 40 last name); with team it's 100. Thresholds are applied to the normalized percentage. Three frontend files consume the summary type and need the new `partialMatches` field.

**Tech Stack:** TypeScript, Vitest (unit tests), React (DeviceImportDialog)

---

## File Map

| File | Change |
|---|---|
| `packages/api/athlete-matching.ts` | Add normalization; adjust classification thresholds; add manual-review check to `exact` branch |
| `packages/api/__tests__/athlete-matching.test.ts` | Update 3 tests whose expected values change |
| `packages/api/services/device-import-service.ts` | Add `partialMatches` to summary |
| `packages/web/src/hooks/useDeviceImport.ts` | Add `partialMatches: number` to `PreviewSummary` type |
| `packages/web/src/components/device-import/DeviceImportDialog.tsx` | Render `partialMatches` pill |

---

## Task 1: Fix classification in athlete-matching.ts

**Files:**
- Modify: `packages/api/athlete-matching.ts:211-248`

### Background

`findBestAthleteMatch` applies thresholds (exact ≥90, fuzzy ≥75, partial ≥60) against a raw score
whose maximum is either 70 (no team) or 100 (with team). Without team context, score 70 = exact
name match but classifies as "partial" because 70 < 90.

Fix: compute `normalizedPct = rawScore / maxPossibleScore * 100` then apply thresholds to that.

New thresholds (applied to normalizedPct):
- ≥ 90% → `exact`
- ≥ 70% → `fuzzy`
- ≥ 50% → `partial`
- < 50% → `none`

Also add the close-gap `requiresManualReview` check to the `exact` branch (needed when two athletes have identical names — both normalize to 100%, gap is 0).

- [ ] **Step 1: Replace the classification block**

Replace the entire block starting at `// Determine match type and confidence based on new scoring system` (around line 211) through the end of `requiresManualReview = false;` (around line 235) with:

```typescript
  // Compute max achievable score based on whether team context was provided.
  // Without team: first (30) + last (40) = 70. With team: 70 + 30 = 100.
  const maxPossibleScore = criteria.teamName ? 100 : 70;
  const normalizedPct = Math.round((bestCandidate.matchScore / maxPossibleScore) * 100);
  const secondNormalizedPct = secondBest
    ? Math.round((secondBest.matchScore / maxPossibleScore) * 100)
    : 0;

  let matchType: 'exact' | 'fuzzy' | 'partial' | 'none';
  let confidence: number;
  let requiresManualReview = false;

  if (normalizedPct >= 90) {
    matchType = 'exact';
    confidence = normalizedPct;
    // Flag manual review when two candidates are tied or very close (e.g. duplicate names)
    if (secondBest && (normalizedPct - secondNormalizedPct) < 10) {
      requiresManualReview = true;
    }
  } else if (normalizedPct >= 70) {
    matchType = 'fuzzy';
    confidence = normalizedPct;
    if (secondBest && (normalizedPct - secondNormalizedPct) < 10) {
      requiresManualReview = true;
    }
  } else if (normalizedPct >= 50) {
    matchType = 'partial';
    confidence = normalizedPct;
    requiresManualReview = true;
  } else {
    matchType = 'none';
    confidence = 0;
    requiresManualReview = false;
  }
```

- [ ] **Step 2: Run the existing tests to see which ones fail**

```bash
cd /home/hulla/devel/AthleteMetrics
npx vitest run packages/api/__tests__/athlete-matching.test.ts 2>&1 | grep -E "FAIL|PASS|×|✓|expect"
```

Expected: 3 failures (the tests listed in Task 2). All other tests should pass.

- [ ] **Step 3: Commit (tests red — intentional TDD checkpoint)**

```bash
git add packages/api/athlete-matching.ts
git commit -m "refactor(matching): normalize score against maxPossibleScore before classifying"
```

---

## Task 2: Update affected tests

**Files:**
- Modify: `packages/api/__tests__/athlete-matching.test.ts`

Three tests have hardcoded expectations that are now wrong after normalization.

- [ ] **Step 1: Update "handles single athlete in array (name-only = partial at 70)"**

Find this test (around line 300) and replace it entirely:

```typescript
  it('returns exact match for identical names without team context', () => {
    const athletes = [
      makeAthlete({ id: 'a1', firstName: 'John', lastName: 'Doe' }),
    ];
    // Without teamName: maxPossibleScore = 70, normalizedPct = 70/70*100 = 100% → exact
    const result = findBestAthleteMatch({ firstName: 'John', lastName: 'Doe' }, athletes);
    expect(result.type).toBe('exact');
    expect(result.candidate?.id).toBe('a1');
    expect(result.confidence).toBe(100);
  });
```

- [ ] **Step 2: Update "matches 'Jon' vs 'John' with team boost"**

Find this test (around line 363) and replace it entirely:

```typescript
    it('matches "Jon" vs "John" with team boost', () => {
      const athletes = [
        makeAthlete({ id: 'a1', firstName: 'John', lastName: 'Smith', teams: [{ name: 'BTA', id: 't1' }] }),
      ];
      const result = findBestAthleteMatch(
        { firstName: 'Jon', lastName: 'Smith', teamName: 'BTA' },
        athletes
      );
      // "Jon" vs "John": similarity = 75% → below 80% threshold → 0 pts first name
      // Raw = 0 (first) + 40 (last exact) + 30 (team exact) = 70
      // maxPossibleScore = 100 (teamName provided), normalizedPct = 70% → fuzzy
      expect(result.type).toBe('fuzzy');
      expect(result.candidate?.id).toBe('a1');
      expect(result.confidence).toBe(70);
    });
```

- [ ] **Step 3: Update the comment in "flags manual review when two athletes have identical names"**

Find the comment block around line 496-497 that reads:
```
      // Both score 70 (30+40), gap is 0 < 10 → manual review if type is fuzzy
      // At 70, type is "partial" which always requires manual review
```

Replace the two comment lines with:
```typescript
      // Both normalize to 100% (70/70, no team context) → exact.
      // Gap is 0 < 10 → requiresManualReview = true via the exact-branch close-gap check.
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
npx vitest run packages/api/__tests__/athlete-matching.test.ts 2>&1 | tail -10
```

Expected output:
```
 Test Files  1 passed (1)
      Tests  60 passed (60)
```

- [ ] **Step 5: Commit**

```bash
git add packages/api/__tests__/athlete-matching.test.ts
git commit -m "test(matching): update 3 tests to reflect normalized score classification"
```

---

## Task 3: Add partialMatches to server summary

**Files:**
- Modify: `packages/api/services/device-import-service.ts:154-163`

- [ ] **Step 1: Add partialMatches to the summary object**

Find the `// Build summary` block (around line 153) and replace it:

```typescript
    // Build summary
    const summary = {
      totalAthletes: previewAthletes.length,
      exactMatches: previewAthletes.filter(a => a.matchType === 'exact').length,
      fuzzyMatches: previewAthletes.filter(a => a.matchType === 'fuzzy').length,
      partialMatches: previewAthletes.filter(a => a.matchType === 'partial').length,
      unmatched: previewAthletes.filter(a => a.matchType === 'none').length,
      totalDrills: previewAthletes.reduce((sum, a) => sum + a.drills.length, 0),
      outlierCount: previewAthletes.reduce(
        (sum, a) => sum + a.drills.filter(d => d.isOutlier).length, 0
      ),
    };
```

- [ ] **Step 2: Run all device-import-related tests**

```bash
npx vitest run packages/api/routes/__tests__/device-import-routes.test.ts packages/api/__tests__/athlete-matching.test.ts 2>&1 | tail -10
```

Expected:
```
 Test Files  2 passed (2)
      Tests  75 passed (75)
```

- [ ] **Step 3: Commit**

```bash
git add packages/api/services/device-import-service.ts
git commit -m "feat(import): add partialMatches to parse session summary"
```

---

## Task 4: Add partialMatches to frontend type and UI

**Files:**
- Modify: `packages/web/src/hooks/useDeviceImport.ts:52-59`
- Modify: `packages/web/src/components/device-import/DeviceImportDialog.tsx:504-520`

- [ ] **Step 1: Add partialMatches to PreviewSummary type**

In `packages/web/src/hooks/useDeviceImport.ts`, find the `PreviewSummary` interface (around line 52) and replace it:

```typescript
export interface PreviewSummary {
  totalAthletes: number;
  exactMatches: number;
  fuzzyMatches: number;
  partialMatches: number;
  unmatched: number;
  totalDrills: number;
  outlierCount: number;
}
```

- [ ] **Step 2: Add partial pill to summary chips**

In `packages/web/src/components/device-import/DeviceImportDialog.tsx`, find the `{/* Summary chips */}` block (around line 504) and replace the entire `<div className="flex flex-wrap gap-2 text-sm">` block:

```tsx
        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-xs font-medium">
            {summary.exactMatches} exact
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs font-medium">
            {summary.fuzzyMatches} fuzzy
          </span>
          {summary.partialMatches > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
              {summary.partialMatches} partial
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">
            {summary.unmatched} unmatched
          </span>
          {summary.outlierCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
              {summary.outlierCount} outliers
            </span>
          )}
        </div>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit --project packages/web/tsconfig.json 2>&1 | grep -E "device-import|useDeviceImport" | head -10
```

Expected: no errors in these files.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useDeviceImport.ts \
        packages/web/src/components/device-import/DeviceImportDialog.tsx
git commit -m "feat(ui): add partial match count to import wizard summary"
```

---

## Task 5: Push and verify

- [ ] **Step 1: Push branch**

```bash
git push
```

- [ ] **Step 2: Manual verification checklist**

1. Open the app and navigate to a Data Entry page with an event
2. Click "Upload Device File" and import `texas_fc_u18_girls_dashr_measurements.csv`
3. On Step 2 (Review), confirm:
   - Summary shows **N exact**, **0 fuzzy**, **0 partial**, **0 unmatched** (all 16 athletes should be exact)
   - Every athlete row badge shows **Exact** (green), not "Partial" (orange)
   - The wizard continues to function correctly through Confirm and Done steps
