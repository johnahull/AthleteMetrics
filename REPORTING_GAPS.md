# Report System Gaps and Enhancement Plan

## Current Limitations

The report generation system currently has these gaps compared to the analytics system:

### 1. Missing Timeframe Type Support
**Analytics has:**
- `timeframeType: 'best' | 'trends'`
- Shows either best performances OR trends over time

**Reports need:**
- Add `timeframeType` to `ReportTemplateConfig`
- Support both "Best Performances" and "Performance Trends" reports
- Allow users to choose in ReportBuilder

### 2. Missing Analysis Type Mapping
**Analytics has:**
- `individual` - Single athlete
- `intra_group` - Multiple athletes within a group (comparison)
- `inter_group` - Multiple groups comparison

**Reports have:**
- `individual` - Maps to analytics `individual`
- `multi_athlete` - Should map to analytics `intra_group`
- `team` - Should map to analytics `inter_group`
- `recruiting` - Uses analytics `individual` with specific charts

**Needs:**
- Explicit mapping in report generation
- Pass correct `analysisType` to analytics service

### 3. Missing Chart Support
**Analytics supports all these, reports need:**
- ✅ `box_plot` - Supported
- ✅ `distribution` - Supported
- ✅ `bar_chart` - Supported
- ✅ `line_chart` - Supported (as connected_scatter/multi_line)
- ✅ `scatter_plot` - Supported
- ✅ `radar_chart` - Supported
- ✅ `swarm_plot` - Supported
- ✅ `connected_scatter` - Supported
- ✅ `multi_line` - Supported
- ✅ `box_swarm_combo` - Supported
- ✅ `time_series_box_swarm` - Supported

Charts are covered! ✅

### 4. Data Integration Gap
**Analytics returns:**
```typescript
{
  data: ChartDataPoint[],
  trends?: TrendData[],
  multiMetric?: MultiMetricData[],
  statistics: Record<string, StatisticalSummary>,
  groupings: Record<string, ChartDataPoint[]>,
  meta: { ... }
}
```

**Reports expect:**
```typescript
{
  meta: { title, organizationName, ... },
  athletes: [...],
  sections: [{ type, title, content }]
}
```

**Needs:**
- Transform analytics data to report data structure
- Include all chart types from analytics
- Preserve statistics, trends, and groupings

## Enhancement Plan

### Phase 1: Add Timeframe Type Support
1. Update `ReportTemplateConfig` to include `timeframeType: 'best' | 'trends'`
2. Add timeframe selector to ReportBuilder UI
3. Pass timeframe to analytics service when generating reports
4. Create separate default templates for "best" vs "trends"

### Phase 2: Integrate with Analytics Service
1. Update `ReportService.fetchReportData()` to:
   - Call the analytics service directly
   - Map report types to analysis types
   - Transform `AnalyticsResponse` to `ReportData`
2. Generate chart sections from analytics data
3. Include all statistics, trends, and multi-metric data

### Phase 3: Complete Chart Coverage
1. Ensure all report templates can use any analytics chart
2. Add chart type selector in ReportBuilder
3. Support dynamic chart configurations

### Phase 4: Advanced Features
1. Multi-group comparison reports (inter_group)
2. Custom grouping dimensions (by age, gender, team, etc.)
3. Percentile rankings and benchmarking
4. Trend analysis with statistical significance

## Implementation Status

**✅ Completed (High Priority):**
- [x] Add `timeframeType` to report configuration
  - Added to ReportTemplateConfig interface
  - Updated all default templates with appropriate timeframeType
- [x] Integrate analytics service in report generation
  - ReportService now calls AnalyticsService.getAnalyticsData()
  - Added getAnalysisTypeForReport() mapping function
  - Server merges partial config with defaults
- [x] Transform analytics data to report sections
  - Created report-data-transformer.ts
  - Transforms AnalyticsResponse to ReportData structure
  - Supports all chart types (connected_scatter, multi_line, radar, box_plot, swarm, etc.)
- [x] Add timeframe selector to ReportBuilder
  - Added timeframeType dropdown in UI
  - Passes timeframeType through GenerateReportRequest
  - Shows "Best Performances" vs "Performance Trends" options
- [x] Support all analysis types
  - individual → analytics individual
  - multi_athlete → analytics intra_group
  - team → analytics inter_group
  - recruiting → analytics individual
- [x] Report templates use real analytics data
  - Templates already designed to consume ReportData
  - Charts receive proper TrendData/MultiMetricData from analytics

**Medium Priority (Next Sprint):**
- [ ] Add chart type customization in ReportBuilder UI
- [ ] Date range selector in ReportBuilder
- [ ] Metric selector in ReportBuilder

**Low Priority (Future):**
- [ ] Advanced grouping dimensions
- [ ] Statistical significance testing
- [ ] Automated insights generation

## Example: What Full Integration Looks Like

```typescript
// User selects in ReportBuilder:
const reportRequest = {
  reportType: "individual",
  athleteIds: ["athlete-123"],
  config: {
    timeframeType: "trends", // NEW!
    analysisType: "individual", // Maps from reportType
    metrics: { primary: "FLY10_TIME", additional: ["VERTICAL_JUMP"] },
    timeframe: {
      type: "trends", // Uses timeframeType
      period: "this_year"
    },
    charts: [
      { type: "connected_scatter", metrics: ["FLY10_TIME"] },
      { type: "multi_line", metrics: ["FLY10_TIME", "VERTICAL_JUMP"] }
    ]
  }
};

// Server calls analytics service:
const analyticsResponse = await analyticsService.getAnalyticsData({
  analysisType: "individual",
  athleteId: "athlete-123",
  timeframe: { type: "trends", period: "this_year" },
  metrics: { primary: "FLY10_TIME", additional: ["VERTICAL_JUMP"] },
  filters: { organizationId: "org-123" }
});

// Transform to report data:
const reportData = {
  meta: { ... },
  athletes: [{ id: "athlete-123", name: "John Smith" }],
  sections: [
    {
      type: "chart",
      title: "Performance Trends",
      content: {
        chartType: "connected_scatter",
        chartData: analyticsResponse.trends[0] // Actual trend data!
      }
    },
    {
      type: "statistics",
      title: "Performance Statistics",
      content: { stats: analyticsResponse.statistics }
    }
  ]
};
```

## Benefits of Full Integration

1. **Consistency**: Reports show same data as analytics views
2. **Flexibility**: All chart types automatically available
3. **Best & Trends**: Support both analysis modes
4. **Rich Data**: Statistics, percentiles, groupings included
5. **Maintainability**: Single source of truth (analytics service)
6. **Future-Proof**: New charts/features automatically work in reports