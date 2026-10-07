# Metric Maintenance Guide

This document provides a comprehensive checklist for adding, modifying, or removing performance metrics in AthleteMetrics.

## Quick Checklist

When adding a new metric, update the following files in order:

- [ ] **Database Schema** - `shared/schema.ts`
- [ ] **Analytics Config** - `shared/analytics-types.ts`
- [ ] **Measurement Forms** (3 files)
- [ ] **Display Utilities** - `client/src/lib/metrics.ts`
- [ ] **Import/Export** (3 files)
- [ ] **Analytics Selector** - `client/src/components/analytics/MetricsSelector.tsx`
- [ ] **OCR System** (3 files)
- [ ] **Database Migration** - Run `npm run db:push`

---

## Detailed Implementation Steps

### 1. Database Schema & Types

#### `shared/schema.ts`

**Location:** Line ~399 (metric enum in `insertMeasurementSchema`)

Add the metric to the enum:
```typescript
metric: z.enum([
  "FLY10_TIME",
  "VERTICAL_JUMP",
  "AGILITY_505",
  "AGILITY_5105",
  "T_TEST",
  "DASH_40YD",
  "RSI",
  "YOUR_NEW_METRIC" // Add here
])
```

**Location:** Line ~461 (MetricType constant)

Add to the MetricType object:
```typescript
export const MetricType = {
  FLY10_TIME: "FLY10_TIME",
  VERTICAL_JUMP: "VERTICAL_JUMP",
  // ... existing metrics
  YOUR_NEW_METRIC: "YOUR_NEW_METRIC", // Add here
} as const;
```

#### `shared/analytics-types.ts`

**Location:** Line ~382-390 (METRIC_CONFIG)

Add metric configuration:
```typescript
export const METRIC_CONFIG = {
  FLY10_TIME: { label: '10-Yard Fly Time', unit: 's', lowerIsBetter: true },
  // ... existing metrics
  YOUR_NEW_METRIC: {
    label: 'Your Metric Display Name',
    unit: 'units',
    lowerIsBetter: false // or true
  }
} as const;
```

**After changes:** Run `npm run db:push` to apply schema changes to database.

---

### 2. Frontend Forms (Measurement Entry)

Update all measurement form dropdowns to include the new metric:

#### `client/src/components/measurement-form.tsx`

**Location:** Line ~286-292 (metric dropdown)

Add SelectItem:
```tsx
<SelectContent>
  <SelectItem value="FLY10_TIME">10-Yard Fly Time</SelectItem>
  {/* ... existing items */}
  <SelectItem value="YOUR_NEW_METRIC">Your Metric Name</SelectItem>
</SelectContent>
```

**Location:** Line ~149 (units calculation)

Update units logic if needed:
```typescript
const units = metric === "VERTICAL_JUMP" ? "in"
  : metric === "RSI" ? ""
  : metric === "YOUR_NEW_METRIC" ? "your-unit"
  : "s";
```

#### `client/src/components/athlete-measurement-form.tsx`

**Location:** Line ~129-136 (metric dropdown)

Add SelectItem (same as above)

**Location:** Line ~69 (units calculation)

Update units logic (same pattern as above)

#### `client/src/pages/data-entry.tsx`

**Location:** Line ~50 (display logic)

Update metric display if needed:
```typescript
<span>
  {measurement.metric === "FLY10_TIME" ? "Fly-10"
    : measurement.metric === "YOUR_NEW_METRIC" ? "Your Metric"
    : "Vertical"}: {measurement.value}{measurement.units}
</span>
```

---

### 3. Display & Formatting Utilities

#### `client/src/lib/metrics.ts`

Update **ALL** six functions:

**`getMetricDisplayName(metric: string)`** - Line ~5
```typescript
case "YOUR_NEW_METRIC":
  return "Your Metric Name";
```

**`getMetricBadgeVariant(metric: string)`** - Line ~26
```typescript
case "YOUR_NEW_METRIC":
  return "secondary"; // Choose: "default" | "secondary" | "destructive" | "outline"
```

**`getMetricColor(metric: string)`** - Line ~46
```typescript
case "YOUR_NEW_METRIC":
  return "bg-teal-100 text-teal-800"; // Choose Tailwind colors
```

**`getMetricUnits(metric: string)`** - Line ~67
```typescript
case "YOUR_NEW_METRIC":
  return "mph"; // Return unit string
```

**`getMetricIcon(metric: string)`** - Line ~84
```typescript
case "YOUR_NEW_METRIC":
  return Gauge; // Choose from lucide-react icons
```

**`formatMetricValue(metric: string, value: number)`** - Line ~104
```typescript
case "YOUR_NEW_METRIC":
  return `${value} mph`; // Format as needed
```

---

### 4. Import/Export System

#### `client/src/lib/csv.ts`

**Location:** Line ~238 (validMetrics array)

Add to validation array:
```typescript
const validMetrics = [
  'FLY10_TIME',
  'VERTICAL_JUMP',
  // ... existing
  'YOUR_NEW_METRIC'
];
```

#### `client/src/pages/import-export.tsx`

**Location:** Line ~140-148 (CSV template example)

Add example row:
```typescript
const measurementsTemplate = `firstName,lastName,gender,teamName,date,age,metric,value,units,flyInDistance,notes
Mia,Chen,Female,FIERCE 08G,2025-01-20,15,FLY10_TIME,1.26,s,20,Electronic gates
{/* ... existing examples */}
Avery,Smith,Female,FIERCE 08G,2025-01-12,16,YOUR_NEW_METRIC,18.5,mph,,Measured with device`;
```

#### `server/routes.ts`

**Location:** Line ~3924 (units auto-detection in import)

Update units logic:
```typescript
units: units || (
  metric === 'FLY10_TIME' ? 's' :
  metric === 'VERTICAL_JUMP' ? 'in' :
  metric === 'YOUR_NEW_METRIC' ? 'mph' :
  metric === 'RSI' ? '' :
  's'
)
```

---

### 5. Analytics Metrics Selector

#### `client/src/components/analytics/MetricsSelector.tsx`

**Special Case: Mutual Exclusion**

If your new metric should NOT be selected alongside another metric (e.g., FLY10_TIME and TOP_SPEED are mutually exclusive because they measure the same thing):

**Location:** Top of file (after imports)

Add mutual exclusion mapping:
```typescript
// Mutually exclusive metrics - selecting one auto-removes the other
const MUTUALLY_EXCLUSIVE_METRICS: Record<string, string> = {
  FLY10_TIME: 'TOP_SPEED',
  TOP_SPEED: 'FLY10_TIME',
  // Add more pairs as needed
};
```

**Location:** Line ~50-57 (`handlePrimaryMetricChange`)

Update to handle mutual exclusion:
```typescript
const handlePrimaryMetricChange = (metric: string) => {
  // Remove from additional if it was there
  let newAdditional = metrics.additional.filter(m => m !== metric);

  // Check for mutually exclusive metric
  const exclusiveMetric = MUTUALLY_EXCLUSIVE_METRICS[metric];
  if (exclusiveMetric) {
    // Remove the mutually exclusive metric from additional
    newAdditional = newAdditional.filter(m => m !== exclusiveMetric);
  }

  onMetricsChange({
    primary: metric,
    additional: newAdditional
  });
};
```

**Location:** Line ~59-75 (`handleAdditionalMetricToggle`)

Update to prevent adding mutually exclusive metrics:
```typescript
const handleAdditionalMetricToggle = (metric: string, checked: boolean) => {
  if (checked) {
    // Don't add if it's the primary metric or we're at the limit
    if (metric === metrics.primary || metrics.additional.length >= maxAdditional) {
      return;
    }

    // Check for mutual exclusion
    const exclusiveMetric = MUTUALLY_EXCLUSIVE_METRICS[metric];
    if (exclusiveMetric &&
        (metrics.primary === exclusiveMetric ||
         metrics.additional.includes(exclusiveMetric))) {
      // Don't add if mutually exclusive metric is already selected
      return;
    }

    onMetricsChange({
      ...metrics,
      additional: [...metrics.additional, metric]
    });
  } else {
    onMetricsChange({
      ...metrics,
      additional: metrics.additional.filter(m => m !== metric)
    });
  }
};
```

**Location:** Line ~177-205 (render checkboxes)

Update to disable mutually exclusive options:
```typescript
.map((metric: string) => {
  const config = METRIC_CONFIG[metric as keyof typeof METRIC_CONFIG];

  // Check if this metric is mutually exclusive with a selected metric
  const exclusiveMetric = MUTUALLY_EXCLUSIVE_METRICS[metric];
  const isExcluded = exclusiveMetric &&
    (metrics.primary === exclusiveMetric ||
     metrics.additional.includes(exclusiveMetric));

  const isDisabled = metrics.additional.length >= maxAdditional ||
                     isMultiGroupMode ||
                     isExcluded;

  return (
    <div key={metric} className="flex items-start space-x-2">
      <Checkbox
        id={`metric-${metric}`}
        checked={false}
        onCheckedChange={(checked) =>
          handleAdditionalMetricToggle(metric, checked as boolean)
        }
        disabled={isDisabled}
      />
      <label
        htmlFor={`metric-${metric}`}
        className={`text-xs leading-tight cursor-pointer ${
          isExcluded ? 'text-muted-foreground' : ''
        }`}
      >
        {config?.label || metric}
        {isExcluded && <span className="text-xs ml-1">(conflicts with {
          METRIC_CONFIG[exclusiveMetric as keyof typeof METRIC_CONFIG]?.label
        })</span>}
      </label>
    </div>
  );
})
```

---

### 6. OCR System (Photo Upload Recognition)

#### `shared/ocr-types.ts`

**Location:** Line ~108-116 (measurementRanges in validation config)

Add reasonable min/max range:
```typescript
measurementRanges: z.record(z.object({
  min: z.number(),
  max: z.number(),
})).default({
  'DASH_40YD': { min: 3.0, max: 8.0 },
  'FLY10_TIME': { min: 0.8, max: 3.0 },
  // ... existing
  'YOUR_NEW_METRIC': { min: 10, max: 25 }, // Add here
})
```

#### `server/ocr/patterns/measurement-patterns.ts`

**Location:** After existing patterns (e.g., after RSI at line ~99)

Add pattern for text recognition:
```typescript
YOUR_NEW_METRIC: {
  patterns: [
    /(?:top|max).*?speed.*?(\d{1,2}(?:\.\d)?)\s*(?:mph)/gi,
    /(\d{1,2}(?:\.\d)?)\s*mph.*?(?:top|max|speed)/gi,
  ],
  confidence: 75,
  validator: (value: string) => {
    const num = parseFloat(value);
    return num >= 10 && num <= 25; // Use same range as OCR config
  }
}
```

#### `server/ocr/validators/measurement-validator.ts`

**Location:** Line ~213-268 (`getMetricSpecificWarnings` method)

Add validation warnings:
```typescript
private getMetricSpecificWarnings(metric: string, value: number): string[] {
  const warnings: string[] = [];

  switch (metric) {
    // ... existing cases

    case 'YOUR_NEW_METRIC':
      if (value < 12) {
        warnings.push('Low top speed - verify measurement accuracy');
      } else if (value > 22) {
        warnings.push('Very high top speed - confirm measurement method');
      }
      break;
  }

  return warnings;
}
```

---

### 7. Database Migration

After making all schema changes, apply them to the database:

```bash
npm run db:push
```

This will:
- Update the database schema
- Add the new metric type to the enum
- Preserve existing data

---

## Special Considerations

### Metric-Specific Features

#### Chart Display Toggles

If your metric can be displayed in multiple ways (like FLY10_TIME can show as time or speed), implement toggle functionality in chart components.

**Example:** FLY10_TIME → TOP_SPEED conversion
```typescript
// Add toggle in chart component
const [showAsSpeed, setShowAsSpeed] = useState(false);

// Transform data
const displayValue = showAsSpeed
  ? 20.45 / timeValue  // Convert to mph
  : timeValue;         // Show as seconds
```

#### Custom Validation

For metrics with special validation rules, update:
- `client/src/lib/csv.ts` - `validateMeasurementCSV()` function
- `server/services/measurement-service.ts` - Add custom validation logic

#### Position-Specific Metrics

If the metric is relevant only to certain positions:
- Update position filters in analytics views
- Add position-specific display logic

---

## Testing Checklist

After implementing a new metric:

- [ ] Create measurement via form
- [ ] Import measurement via CSV
- [ ] Export measurements to CSV
- [ ] View metric in analytics charts
- [ ] Test OCR photo upload (if applicable)
- [ ] Verify metric appears in all dropdowns
- [ ] Check units display correctly
- [ ] Test metric filtering and sorting
- [ ] Verify mutual exclusion (if applicable)
- [ ] Test with multiple metrics selected
- [ ] Check mobile responsiveness

---

## Removing a Metric

To remove a metric safely:

1. **Do NOT delete from schema enum** - This will break existing data
2. **Deprecate instead:** Add to a deprecated list
3. **Hide from UI:** Remove from form dropdowns and selectors
4. **Keep backend support:** Maintain database column and validation
5. **Data migration:** Optionally migrate old data to new metric

---

## Common Pitfalls

### ❌ Don't Forget
- Updating units logic in **both** measurement forms
- Adding to **all 6 functions** in `metrics.ts`
- Running `npm run db:push` after schema changes
- Testing CSV import/export with the new metric

### ❌ Don't Break
- Existing measurements with old metrics
- Analytics queries that reference metric enums
- Chart components that iterate over METRIC_CONFIG

### ✅ Do Remember
- Use consistent naming (SCREAMING_SNAKE_CASE for enum values)
- Add proper TypeScript types
- Include helpful tooltips and descriptions
- Test thoroughly before pushing to production

---

## Example: Adding TOP_SPEED

See the commit that adds TOP_SPEED as a reference implementation of this guide.

**Key decisions for TOP_SPEED:**
- Units: `mph` (miles per hour)
- Range: 10-25 mph (reasonable for soccer athletes)
- Icon: `Gauge` from lucide-react
- Color: `bg-teal-100 text-teal-800`
- Mutual exclusion: Cannot select with FLY10_TIME (measures same thing)
- Display: Higher is better (`lowerIsBetter: false`)

---

## Database Migration Safety

### Development Environment

When adding a new metric, you'll need to update the database schema:

```bash
npm run db:push
```

**What this does:**
- Generates SQL migration from `shared/schema.ts` changes
- Applies changes to your development database
- Updates type definitions

**Safety checks:**
- ✅ Always commit code changes BEFORE running `db:push`
- ✅ Review generated SQL in console output
- ✅ Test with sample data before deploying
- ✅ Verify existing measurements are unaffected

### Production Deployment

**Pre-deployment checklist:**
1. **Test in staging** - Apply migration to staging environment first
2. **Backup database** - Create snapshot before migration
3. **Review migration** - Check SQL for destructive operations
4. **Plan rollback** - Know how to revert if needed
5. **Low-traffic window** - Deploy during off-peak hours

**Deployment process:**
```bash
# 1. SSH to production server
ssh production-server

# 2. Pull latest code
git pull origin main

# 3. Install dependencies
npm install

# 4. Apply migration (review SQL output carefully)
npm run db:push

# 5. Restart application
npm run start
```

**Post-deployment verification:**
- ✅ Check application logs for errors
- ✅ Verify new metric appears in UI
- ✅ Test creating measurements with new metric
- ✅ Confirm existing data is intact

### Rollback Strategy

If migration causes issues:

**Immediate rollback:**
```bash
# 1. Revert code to previous commit
git revert HEAD
git push origin main

# 2. Restore database from backup
# (Command depends on your database provider)
pg_restore --clean --dbname=athletemetrics backup.dump
```

**Removing a metric safely:**
1. Remove metric from `shared/schema.ts` enum
2. Remove from `METRIC_CONFIG` in `shared/analytics-types.ts`
3. Remove from all UI components
4. Run `npm run db:push` - this WON'T delete existing data
5. Existing measurements with old metric remain in database but won't appear in UI

**Warning:** Database schema changes are ONE-WAY. Drizzle's `db:push` command doesn't automatically delete columns or data. To remove a metric completely from the database, you'd need to write a custom migration.

### Common Migration Issues

**Issue:** "Constraint violation" error
- **Cause:** Existing data conflicts with new validation rules
- **Fix:** Update data first, then apply schema changes

**Issue:** "Type mismatch" error
- **Cause:** Metric enum mismatch between code and database
- **Fix:** Ensure `shared/schema.ts` is committed and `npm run db:push` completed

**Issue:** New metric doesn't appear in dropdown
- **Cause:** Frontend cache or missing METRIC_CONFIG entry
- **Fix:** Hard refresh browser (Ctrl+Shift+R), verify METRIC_CONFIG updated

---

## Questions?

If you encounter issues or need clarification:
1. Check existing metric implementations as examples
2. Review this guide for missed steps
3. Test in development environment first
4. Verify database migration succeeds before deploying

---

## Movement Quality Index (MQI) Metrics (AM-FEAT-015)

Ordinal rubric metrics that deviate from the standard checklist above. Decision record: `docs/adr/ADR-001-measurement-media-url-and-mqi-capture.md`.

| Metric | Range | Notes |
|---|---|---|
| 12 x `MQ_*` (8 patterns + 4 `MQ_TRANS_*`) | 0-3 ordinal | Entered per athlete per event; unit `score` |
| `MQI_TOTAL` | 0-24 | Derived from the 8 pattern metrics |
| `MQ_TRANSITION_TOTAL` | 0-12 | Derived from the 4 `MQ_TRANS_*` metrics |

Maintenance rules:
- **Seeding**: metrics are seeded by manual migration `0146_seed_mqi_metrics.sql`, not by the enum steps above. Re-applying 0146 merges `calculation_config`, so 0148's `sourceSelection` survives.
- **Which codes are "MQ"**: `packages/shared/peer-comparison-exclusions.ts` matches by prefix (`EXCLUDED_PREFIXES = ['MQ_', 'MQI_']`). That one predicate drives the zero-value rule, the coach-only rule and the comparison exclusions. A new ordinal score must use the `MQ_` prefix (not `MQI_`, which is only the derived total), `category = 'Movement Quality'` (the panel save accepts only non-derived metrics of that category), `validation_min = 0`, `validation_max` and `decimal_precision = 0`. The one-score-per-event unique index from 0149 only covers `metric LIKE 'MQ\_%'`. The panel UI lists the codes in `packages/shared/mqi-entry-schema.ts` (`MQI_PATTERNS`, `MQI_TRANSITIONS`), so a new score must be added there too.
- **Zero values**: 0 is accepted only for MQ codes whose `site_metrics.validation_min <= 0`; they are then range-checked against `validation_min`/`validation_max`, and `decimal_precision = 0` requires whole numbers (`packages/shared/measurement-value-validation.ts`). A new ordinal metric needs `validation_min = 0` (for a 0-N scale), `validation_max` and `decimal_precision = 0`. On `MeasurementService` paths (measurement form, batch, event entry) every other metric still rejects 0 with no max check, even if its `validation_min` is 0 (e.g. `RSI_L`, `COND_YYIR1_DISTANCE`). The storage write path (`storage.createMeasurement`: CSV import, photo (OCR) import, review queue) applies the range rule to MQ metrics only; for other metrics it keeps its pre-AM-FEAT-015 behavior (no zero or range check), and only rejects a value that is not a finite number. It stores the unit from `site_metrics` (e.g. `score`), falling back to the legacy mapping. The photo (OCR) import cannot import MQ scores: its extractor only recognizes the timed/jump metrics, and it rejects any value <= 0 before the write, so a 0 score would be refused even if recognized. Enter MQ scores in the event panel (or CSV). The calculated totals (`MQI_TOTAL`, `MQ_TRANSITION_TOTAL`) cannot be written by hand on any path: create (service and storage writes), moving a measurement onto a total with `PUT /api/measurements/:id`, and editing a calculated MQ row are all rejected with 400.
- **Derived totals**: `calculationConfig.sourceSelection = 'latest_event'` (migration 0148). Only verified scores count. For a date, the athlete's scores are grouped by event and the latest event wins, ranked by event start time, then event `created_at`; any event outranks scores without an event. Entry order (the newest score's `created_at`) decides only when two events tie on both. Candidates are not limited to one organization: there is one total per athlete and date, and it takes its organization, team, submitter and verification from the newest score of the chosen event (refreshed when the chosen event changes). A total needs all its source metrics from that one event: if the latest event is incomplete, no total is computed and an existing total for that date is deleted (it comes back if the latest event's scores are cleared and an older event is complete). The calculation that follows a measurement write (create, update, delete, event save) reads the sources and creates, updates or deletes the total under one advisory lock per (athlete, total, date), so concurrent score edits cannot leave a stale total. A recalculation creates a missing total only for site derived metrics and the custom derived metrics of the organization of the measurement that triggered it; it also backfills a missing site total (e.g. `MQI_TOTAL`) for that date.
- **Comparisons**: MQ metrics are excluded from peer percentiles, report percentiles / team averages / rankings / composite index, most-improved, benchmarks (create and update) and leaderboards.
- **Notes**: per-pattern notes live in `measurements.notes`.
- **`measurements.media_url`** (migration 0147): nullable, https-only public host (`isSafePublicUrl`, which also blocks private, loopback, link-local, CGNAT, multicast, reserved, broadcast and benchmarking IPv4 ranges), no credentials, no whitespace/control characters, stored in canonical form, max 2048. The DB CHECK on the length is added `NOT VALID` and is not validated in 0147: `apply-manual-migrations.js` runs the file in one transaction, so a `VALIDATE` would scan the table under `ADD COLUMN`'s ACCESS EXCLUSIVE lock; the column is new (all NULL) and new writes are checked anyway. A later migration may validate it in its own transaction. 0147 sets `lock_timeout = '5s'`. Two redaction helpers in `packages/api/utils/measurement-redaction.ts` are used: `omitMediaUrlFromRows` by `parent-routes.ts` and `global-athlete-service.ts` (unified views), and `stripMediaUrlDeep` by `report-service.ts` (public snapshots). CSV, LLM and COPPA exports exclude it by building explicit field lists. The general list queries (`MeasurementService.getMeasurements` and `storage.getMeasurements`) intentionally return `mediaUrl` in authenticated org-scoped views: `GET /api/measurements` returns rows of organizations the requester belongs to, and personal (no-organization) rows only to their own athlete (or a site admin); `filterMode=all` is the union of those, so it is not a cross-organization view. `GET /api/measurements/:id` applies the same rule (org membership, or owner / site admin for a personal row). The unified view is redacted because linked accounts can sit in organizations the requester does not belong to, while the `filterMode=all` list (all of the requester's organizations) returns clips; whether both should behave the same is an open policy decision (below). `GET /api/events/:eventId/measurements` returns `mediaUrl` to event managers, and to the owning athlete once results are published. A teammate athlete of the same organization can also see a clip in the org-scoped lists. A new read path must use an explicit field list without `mediaUrl`, or one of the helpers.
- **Writes**: event results go through `MeasurementService`. An event measurement always belongs to the event's organization, and its team context comes only from the athlete's teams in that organization (a team only if there is exactly one). An MQ score is one row per (athlete, metric, event): writing it again edits it in place (serialized by an advisory lock; migration 0149 adds a partial unique index as a backstop), and the edit records the editor as submitter (and verifier, for coaches and admins). MQ scores always use the event's calendar date (UTC date of `start_date`), whatever date the client sends. Only `POST /api/events/:eventId/measurements` and `POST .../bulk` entries made after results are published notify the athlete and run achievements; the panel save and in-place edits never do (inside the save's transaction `createMeasurement` returns before side effects, and a replaced row skips them). The entry panel saves one athlete with `PUT /api/events/:eventId/athletes/:userId/movement-quality`: upserts and deletes in one transaction, serialized per (event, athlete) by an advisory lock, duplicate ids in `deletes` rejected with 400, and each affected total recalculated once after the commit. Clearing a score uses this route; there is no per-measurement event `DELETE` route. Frozen events reject changes.
- **Entry UI**: `packages/web/src/components/events/MovementQualityPanel.tsx`, opened from event data entry. Event data entry renders only for event managers (site admin, or coach / org admin of the event's organization).
- **Coach-only entry**: only `coach`, `org_admin` and `site_admin` may write an MQ score or set a non-empty clip (`media_url`); this is an allowlist, so athlete, parent, guest and a missing role are all denied. Clearing or omitting `mediaUrl` (null or empty string) is allowed for everyone. Enforced in `MeasurementService` (`assertCanEnterMetric`, `assertCanAttachClip`) on create, batch and update (including moving an entry onto an MQ metric; `updateMeasurement` fails closed without a role), where `POST` / `PUT /api/measurements` answer 403 `{ message }`; and in the storage-based import paths, which call `assertCanEnterMetric` themselves: the CSV and photo (OCR) imports report a denied MQ row as a per-row error in the import result (not a 403), and `POST /api/import/review-decision` answers 403 and leaves the item pending. That route is currently unreachable: `POST /api/import/:type` is registered first and shadows it (issue #517); the guard applies once the order is fixed. Event measurement routes are manager-only, and the event service enforces the allowlist itself: its writes go through `MeasurementService` with the manager role the route resolves, and a call without a role fails closed (treated as an athlete: no MQ scores, no clips, not auto-verified). Event writes are also limited to athletes who belong to the event's organization (400 otherwise; a bulk item gets a per-item error). The athlete self-entry forms hide MQ metrics: `packages/web/src/components/athlete/SelfEntryForm.tsx` and, for athletes, `athlete-measurement-form.tsx`. A new write path that does not go through `MeasurementService` must call `assertCanEnterMetric` itself.
- **Rate limit**: the three event measurement mutation routes (`POST /api/events/:eventId/measurements`, `POST .../measurements/bulk` and `PUT /api/events/:eventId/athletes/:userId/movement-quality`) share one limiter at the STANDARD tier, 100 per 15 minutes, keyed per signed-in user (`eventMeasurementsMutationLimiter` in `event-measurements-routes.ts`). Before AM-FEAT-015 the POST and bulk routes used the MUTATION tier (20 per 15 minutes, per IP). The reads the panel refetches after every save (`GET /api/events/:eventId/measurements` and `.../stats`) use the same tier, also keyed per signed-in user. One MQ save per athlete plus grid saves fits a 25-athlete session. The app-wide `/api` limiter in `packages/api/routes.ts` (100 requests per 15 minutes per IP) still applies first, so several staff on one network share that budget. The `/api/measurements` routes keep their own limiters.
- **Verified-only totals and athletes**: totals use only verified scores, and athlete entries are unverified. Because an athlete-role session cannot create MQ scores on any current write path (coach-only entry above), this does not drop an athlete score from a total; the earlier open item (M4) needs no trigger change. This relies on the session role, which is taken from the user's first organization (see known issues).
- **Known issues (not fixed by AM-FEAT-015)**: the session role comes from the user's first organization rather than the row's organization, for multi-role users (#514); `POST /api/measurements` lets parent and guest sessions write non-MQ measurements for other users (#515); the CSV import has no general athlete block (#516); the import review queue is in memory and not filtered by organization, and its decision route is shadowed (#517).
- **Open policy decisions**: (1) teammate clip visibility: a teammate athlete of the same organization can see clips in the org-scoped lists, and the unified view strips clips while the `filterMode=all` list returns them; (2) coaches do not see their athletes' personal (no-organization) measurements: personal rows are returned only to their athlete or a site admin, also when a coach of a shared organization filters by that athlete (pinned by `tests/integration/personal-measurement-isolation.test.ts`).
- **Global search**: `GlobalSearchService` returns only measurements of the searched organization (`measurements.organization_id`), not a teammate's personal or other-organization rows (fixed alongside this work).
- **Down migrations**: `scripts/apply-manual-migrations.js` skips `*_down.sql`, so run them by hand. 0146 down refuses while any measurement, goal, report benchmark, event metric or organization metric configuration references an MQ code, otherwise deletes the 14 `site_metrics` rows (which also cascades to `site_benchmarks`, `custom_benchmarks` and `peer_percentile_cache`; MQ metrics are excluded from those features). 0147 down drops the CHECK and the `media_url` column (destroys stored links). 0148 down removes `sourceSelection` from both totals. 0149 down drops the unique index (rows removed by its de-dup are not restored).
- **Out of scope (v1)**: bands, report surfacing, BTB / AM-FEAT-014 quadrant, video upload, structured hard-fault.
