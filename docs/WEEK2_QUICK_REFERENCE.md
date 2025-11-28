# Week 2 Quick Reference: MetricProgressCard Component

## Component API

### MetricProgressCard

```tsx
import { MetricProgressCard } from '@/components/athlete/MetricProgressCard';

<MetricProgressCard
  metric="FLY10_TIME"                    // Metric identifier (e.g., 'FLY10_TIME', 'VERTICAL_JUMP')
  displayName="10-Yard Fly Time"         // Human-readable name
  measurements={[                        // Array of measurements for this metric
    { value: 1.40, date: '2024-01-15' },
    { value: 1.45, date: '2024-01-10' },
    // ... more measurements
  ]}
  units="s"                              // Units (e.g., 's', 'in', 'mph')
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `metric` | `string` | Metric identifier (e.g., 'FLY10_TIME', 'VERTICAL_JUMP') |
| `displayName` | `string` | Human-readable metric name displayed in card header |
| `measurements` | `Measurement[]` | Array of measurements with `value` and `date` |
| `units` | `string` | Measurement units (e.g., 's', 'in', 'mph') |

### Measurement Type

```typescript
interface Measurement {
  value: string | number;  // Measurement value (parsed as float)
  date: string;            // ISO date string (YYYY-MM-DD)
}
```

## Utility Functions

### calculateMetricTrend()

Calculates trend direction and percentage change.

```typescript
import { calculateMetricTrend } from '@/utils/metric-trend-utils';

const trendData = calculateMetricTrend(measurements, 'FLY10_TIME');
// Returns:
// {
//   trend: 'improving' | 'steady' | 'declining',
//   percentChange: 12.5,  // Absolute percentage
//   comparisonText: '↑ 12.5% better than previous period',
//   recentAverage: 1.40,
//   previousAverage: 1.58
// }
```

**Algorithm**:
1. Sort measurements by date (newest first)
2. Split into recent (last 5) and previous (next 5)
3. Calculate average for each group
4. Compute percentage change
5. Determine trend based on metric type and change

**Trend Thresholds**:
- **< 5% change**: Steady
- **≥ 5% change**: Improving or Declining (based on metric type)

### getSparklineData()

Extracts last N measurements for charting (sorted oldest to newest).

```typescript
import { getSparklineData } from '@/utils/metric-trend-utils';

const chartData = getSparklineData(measurements, 10);
// Returns: [1.55, 1.52, 1.50, 1.48, 1.45, 1.42, 1.40, 1.38]
```

### getBestValue()

Finds personal best value for a metric.

```typescript
import { getBestValue } from '@/utils/metric-trend-utils';

const best = getBestValue(measurements, 'FLY10_TIME');
// Returns: 1.38 (minimum for time metrics)

const best = getBestValue(measurements, 'VERTICAL_JUMP');
// Returns: 35.0 (maximum for distance metrics)
```

### isLowerIsBetter()

Determines if lower values are better for a metric.

```typescript
import { isLowerIsBetter } from '@/utils/metric-trend-utils';

isLowerIsBetter('FLY10_TIME');    // true (time metrics)
isLowerIsBetter('DASH_40YD');     // true
isLowerIsBetter('VERTICAL_JUMP'); // false (distance metrics)
isLowerIsBetter('TOP_SPEED');     // false
```

## Integration Example

### athlete-profile.tsx

```typescript
import { MetricProgressCard } from '@/components/athlete/MetricProgressCard';
import { getMetricDisplayName, getMetricUnits } from '@/lib/metrics';

// Group measurements by metric
const measurementsByMetric = useMemo(() => {
  const grouped: Record<string, any[]> = {};
  measurements.forEach((m: any) => {
    if (!grouped[m.metric]) {
      grouped[m.metric] = [];
    }
    grouped[m.metric].push(m);
  });
  return grouped;
}, [measurements]);

// Get all unique metrics
const availableMetrics = useMemo(
  () => Object.keys(measurementsByMetric).sort(),
  [measurementsByMetric]
);

// Render progress cards
{availableMetrics.length > 0 && (
  <div className="mb-8">
    <h2 className="text-xl font-semibold text-gray-900 mb-4">
      Performance Progress
    </h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {availableMetrics.map((metric) => (
        <MetricProgressCard
          key={metric}
          metric={metric}
          displayName={getMetricDisplayName(metric)}
          measurements={measurementsByMetric[metric]}
          units={getMetricUnits(metric)}
        />
      ))}
    </div>
  </div>
)}
```

## Visual Design

### Color Scheme

| Trend | Badge | Text | Chart Line |
|-------|-------|------|------------|
| Improving | `bg-green-500` | `text-green-600` | `#10b981` |
| Steady | `bg-yellow-500` | `text-yellow-600` | `#f59e0b` |
| Declining | `bg-red-500` | `text-red-600` | `#ef4444` |

### Icons

| Trend | Icon | Import |
|-------|------|--------|
| Improving | `<TrendingUp />` | `lucide-react` |
| Steady | `<Minus />` | `lucide-react` |
| Declining | `<TrendingDown />` | `lucide-react` |

### Layout

```
┌─────────────────────────────────────┐
│ 10-Yard Fly Time    [↑ Improving]  │ ← Header with trend badge
├─────────────────────────────────────┤
│ Current: 1.38s                      │ ← Current value (large)
│ Best: 1.38s                         │ ← Best value (blue)
│                                     │
│ [~~~Sparkline Chart~~~]             │ ← Last 10 measurements
│                                     │
│ ↑ 12.5% better than previous period │ ← Comparison text
└─────────────────────────────────────┘
```

## Responsive Grid

```css
/* Mobile: 1 column */
grid-cols-1

/* Tablet: 2 columns */
md:grid-cols-2

/* Desktop: 3 columns */
lg:grid-cols-3
```

## Chart Configuration

```typescript
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },       // No legend
    tooltip: {
      enabled: true,
      callbacks: {
        label: (context: any) => `${context.parsed.y}${units}`,
      },
    },
  },
  scales: {
    x: { display: false },            // No x-axis labels
    y: { display: false },            // No y-axis labels
  },
};
```

## Testing

### Run Tests

```bash
# All Week 2 tests
npm run test:run -- packages/web/src/__tests__/components/athlete/MetricProgressCard.test.tsx packages/web/src/__tests__/utils/metric-trend-utils.test.ts

# Watch mode
npm run test:watch -- MetricProgressCard
```

### Test Coverage

- ✅ 19 component tests
- ✅ 20 utility function tests
- ✅ Edge cases (empty, single, < 10 measurements)
- ✅ All trend types (improving, steady, declining)
- ✅ Both metric types (lower-is-better, higher-is-better)

## Common Use Cases

### 1. Display Progress for Single Metric

```tsx
<MetricProgressCard
  metric="FLY10_TIME"
  displayName="10-Yard Fly Time"
  measurements={fly10Measurements}
  units="s"
/>
```

### 2. Display Progress for All Metrics

```tsx
{Object.entries(measurementsByMetric).map(([metric, measurements]) => (
  <MetricProgressCard
    key={metric}
    metric={metric}
    displayName={getMetricDisplayName(metric)}
    measurements={measurements}
    units={getMetricUnits(metric)}
  />
))}
```

### 3. Filter to Specific Metrics

```tsx
{['FLY10_TIME', 'VERTICAL_JUMP', 'DASH_40YD'].map((metric) => (
  measurementsByMetric[metric] && (
    <MetricProgressCard
      key={metric}
      metric={metric}
      displayName={getMetricDisplayName(metric)}
      measurements={measurementsByMetric[metric]}
      units={getMetricUnits(metric)}
    />
  )
))}
```

## Troubleshooting

### Chart Not Rendering

**Problem**: Sparkline chart not visible

**Solution**: Ensure Chart.js is registered globally in App.tsx:

```typescript
// App.tsx
import '@/lib/chart-setup'; // Registers Chart.js components
```

### Wrong Trend Direction

**Problem**: Times showing "declining" when they're improving

**Solution**: Verify metric is in `LOWER_IS_BETTER_METRICS` array:

```typescript
// metric-trend-utils.ts
const LOWER_IS_BETTER_METRICS = [
  'FLY10_TIME',
  'AGILITY_505',
  'AGILITY_5105',
  'T_TEST',
  'DASH_40YD',
];
```

### Empty Card

**Problem**: Card shows "No measurements yet" but data exists

**Solution**: Check measurement data structure:

```typescript
// Measurements must have 'value' and 'date' fields
const measurements = [
  { value: 1.40, date: '2024-01-15' }, // ✅ Correct
  { val: 1.40, dt: '2024-01-15' },     // ❌ Wrong field names
];
```

## Performance Tips

1. **Use useMemo**: Memoize trend and sparkline calculations
2. **Group Once**: Group measurements by metric once, reuse for all cards
3. **Limit Data**: Sparkline only uses last 10 measurements (not all data)
4. **Batch Renders**: Use React's automatic batching for multiple cards

## Accessibility

- ✅ **Color + Icon**: Trends use both (not color-only)
- ✅ **Semantic HTML**: Proper heading structure
- ✅ **Tooltips**: Chart tooltips for exact values
- ✅ **data-testid**: All elements have test IDs

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

Chart.js is widely supported across modern browsers.

---

**For detailed implementation notes, see**: `WEEK2_IMPLEMENTATION_SUMMARY.md`
