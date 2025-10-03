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

## Questions?

If you encounter issues or need clarification:
1. Check existing metric implementations as examples
2. Review this guide for missed steps
3. Test in development environment first
4. Verify database migration succeeds before deploying
