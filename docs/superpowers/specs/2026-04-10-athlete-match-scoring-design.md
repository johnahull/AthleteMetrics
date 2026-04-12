# Athlete Match Scoring Fix

**Date:** 2026-04-10
**Branch:** feature/dashr-data-sync
**Status:** Approved

## Problem

The device import wizard shows all athletes as "Partial" matches and the summary
counters (exact / fuzzy / unmatched) all read zero. This makes the Review step
confusing — users cannot tell how confident the system is about its matches.

### Root Cause

`findBestAthleteMatch` (packages/api/athlete-matching.ts) uses absolute score
thresholds against a maximum of 100 points:

| Points | Source |
|--------|--------|
| 30 | First name match |
| 40 | Last name match |
| 30 | Team name match |

Device imports (Dashr CSV) never supply team context, so the highest possible
score is 70. The "exact" threshold is 90, making it unreachable. Two athletes
with identical names score 70 → classified as "partial" instead of "exact".

Additionally, the summary object in `device-import-service.ts` only counts
`exact`, `fuzzy`, and `none` — omitting `partial`. Any partial matches are
silently invisible in the UI.

## Design

### 1. Normalize score before classifying (`athlete-matching.ts`)

Compute `maxPossibleScore` based on whether team criteria was supplied:

```
maxPossibleScore = criteria.teamName ? 100 : 70
normalizedPct    = (rawScore / maxPossibleScore) * 100
```

Apply thresholds to the **normalized percentage**:

| Normalized % | Type |
|---|---|
| ≥ 90% | `exact` |
| ≥ 70% | `fuzzy` |
| ≥ 50% | `partial` |
| < 50% | `none` |

**Concrete examples (no team context, max = 70):**

| CSV name | System name | Raw score | Normalized | Result |
|---|---|---|---|---|
| Charlotte Lopez | Charlotte Lopez | 70 | 100% | exact ✓ |
| Charlotte Lopez | Charlotte Lopes | ~62 | ~89% | fuzzy ✓ |
| Charlotte Lopez | Grace Lopez | ~42 | ~60% | partial ✓ |
| Charlotte Lopez | Victoria Nguyen | ~0 | 0% | none ✓ |

The `requiresManualReview` flag logic remains unchanged (triggers when top two
candidates are within 10 normalized points of each other).

### 2. Add `partialMatches` to summary (`device-import-service.ts`)

```ts
const summary = {
  totalAthletes: ...,
  exactMatches: previewAthletes.filter(a => a.matchType === 'exact').length,
  fuzzyMatches: previewAthletes.filter(a => a.matchType === 'fuzzy').length,
  partialMatches: previewAthletes.filter(a => a.matchType === 'partial').length,
  unmatched: previewAthletes.filter(a => a.matchType === 'none').length,
  totalDrills: ...,
  outlierCount: ...,
};
```

### 3. Display partial count in wizard (`DeviceImportDialog.tsx`)

Add a 4th pill to the summary row in the Review step using the existing orange
color that already matches the "Partial" badge:

```
[N exact]  [N fuzzy]  [N partial]  [N unmatched]
```

The `partialMatches` pill is hidden when count is 0 (same pattern as existing
pills). The `unmatched` pill already follows this pattern.

## Files Changed

| File | Change |
|---|---|
| `packages/api/athlete-matching.ts` | Normalize score against maxPossibleScore; adjust thresholds |
| `packages/api/services/device-import-service.ts` | Add `partialMatches` to summary |
| `packages/web/src/components/device-import/DeviceImportDialog.tsx` | Render `partialMatches` pill |

## Testing

- Existing 60 athlete-matching unit tests must continue to pass (with updated
  expectations where classifications change)
- Add unit tests for normalized scoring: no-team case, with-team case, boundary
  values at each threshold
- Manual verification: re-import `texas_fc_u18_girls_dashr_measurements.csv`
  and confirm all athletes show as "exact" with correct summary counts

## Out of Scope

- Changing the raw point values (30/40/30 split)
- Adding new matching criteria (email, birth year)
- Pagination on the batch list (tracked separately)
