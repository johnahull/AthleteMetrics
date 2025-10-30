# Derived Metrics & Insights UI/UX Design

## Overview

This document outlines the UI/UX design for displaying derived performance metrics, comparative insights, and actionable recommendations in AthleteMetrics. The design serves both coaches and athletes with simple, actionable insights while maintaining optional technical depth.

## Design Principles

### Target Users
- **Coaches**: Need comparative views, team analytics, and programming guidance
- **Athletes**: Need personal progress tracking, motivational insights, and self-improvement tips
- **Both served equally**: Different views/permissions for the same underlying insights

### Insight Philosophy
- **Simple and actionable**: Plain language, methodology hidden by default
- **Progressive disclosure**: Allow drilling down into equations/methodology when needed
- **Focus on "what to do next"**: Every insight should connect to action

### Benchmark Comparisons
All four comparison types supported:
1. **Position/sport-specific norms**: Compare against published normative data
2. **Team/peer comparisons**: Rank among teammates or competitive peers
3. **Personal progress over time**: Track improvement against historical baseline
4. **Performance targets/goals**: Compare against coach-set targets

## UI Locations

### Primary: Athlete/Team Profile Pages
Contextual insights embedded where coaches/athletes view individual performance

### Secondary: Dedicated Insights Page
Comprehensive analytics section aggregating all insights in one place

---

## UI Pattern Recommendations

### 1. Athlete/Team Profile Pages (Primary Location)

**Layout: Three-tier progressive disclosure**

```
┌─────────────────────────────────────────────┐
│ PERFORMANCE SNAPSHOT (Top Cards)            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│ │ Power    │ │ Speed    │ │ Overall  │     │
│ │ ●●●●○    │ │ ●●●○○    │ │ ●●●●○    │     │
│ │ 85th %ile│ │ 62nd %ile│ │ 78th %ile│     │
│ └──────────┘ └──────────┘ └──────────┘     │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ KEY INSIGHTS (Expandable sections)          │
│ ► Strengths (2)                              │
│ ► Areas for Development (3)                  │
│ ► Recent Progress (1)                        │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ DETAILED METRICS (Tabs)                      │
│ [Power] [Speed] [Agility] [Endurance]       │
│                                              │
│  Vertical Jump Power (Sayers equation)       │
│  ┌────────────────────────────────────┐     │
│  │ Chart with benchmark overlays       │     │
│  └────────────────────────────────────┘     │
│  Your value: 4,250W | Team avg: 3,890W      │
│  Percentile: 85th (college athletes)         │
│                                              │
│  💡 Insight: Exceptional lower body power    │
│  📋 Recommendation: Maintain with plyometrics│
└─────────────────────────────────────────────┘
```

**Key features:**
- **Glanceable summary** at top (coaches scanning 20+ athletes)
- **Prioritized insights** in middle (what matters most)
- **Drill-down details** at bottom (when needed)

---

### 2. Dedicated Insights Page (Deep Analysis View)

**Two-column layout for coaches, single-column for athletes**

#### Coach View:
```
┌────────────────┬───────────────────────────┐
│ TEAM INSIGHTS  │ INDIVIDUAL ATHLETE        │
│                │                           │
│ ⚠ 5 athletes   │ Selected: John Doe        │
│   below target │ ┌─────────────────────┐   │
│                │ │ Performance radar   │   │
│ ✓ Team avg     │ │ chart (multi-dim)   │   │
│   improved 8%  │ └─────────────────────┘   │
│                │                           │
│ 📊 Distribution│ Recommendations:          │
│   [histogram]  │ 1. [Priority 1]           │
│                │ 2. [Priority 2]           │
└────────────────┴───────────────────────────┘
```

#### Athlete View:
```
┌─────────────────────────────────────────────┐
│ YOUR PERFORMANCE PROFILE                     │
│ [Multi-axis radar chart showing all metrics] │
│                                              │
│ 🎯 This Week's Focus                         │
│ Based on your recent tests...                │
│                                              │
│ 💪 Top Priority: Acceleration development    │
│ Your 0-10m split is 25th percentile          │
│ Recommended: 2x/week sprint starts           │
└─────────────────────────────────────────────┘
```

---

## UI Components

### A. Insight Cards with Severity/Priority

#### Strength Card (Green)
```
┌─────────────────────────────────────┐
│ 🟢 STRENGTH                          │
│ Explosive Power                      │
│ 85th percentile among college WRs    │
│ [View details →]                     │
└─────────────────────────────────────┘
```

**Usage**: Highlight athlete's top 2-3 performance areas
**Benchmark**: Above 75th percentile in position-specific norms
**Action**: "Maintain" or "Leverage" recommendations

#### Opportunity Card (Yellow)
```
┌─────────────────────────────────────┐
│ 🟡 OPPORTUNITY                       │
│ Acceleration Phase                   │
│ 0-10m split slower than expected     │
│ based on your max velocity           │
│ [See training plan →]                │
└─────────────────────────────────────┘
```

**Usage**: Identify areas with clear improvement potential
**Benchmark**: 25th-50th percentile, or disproportionate to related metrics
**Action**: Specific training interventions

#### Priority Card (Red)
```
┌─────────────────────────────────────┐
│ 🔴 PRIORITY                          │
│ Deceleration Mechanics               │
│ 505 agility disproportionate to      │
│ linear speed—injury risk indicator   │
│ [Action required →]                  │
└─────────────────────────────────────┘
```

**Usage**: Flag urgent issues (performance decline, injury risk, critical gaps)
**Benchmark**: Below 25th percentile, rapid decline (>10% in 4 weeks), or safety concerns
**Action**: Immediate intervention required

---

### B. Benchmark Comparison Visualizations

#### Option 1: Percentile Bands on Charts
```
┌────────────────────────────────────────┐
│ Vertical Jump Power Over Time          │
│                                        │
│  W ↑  ┌─ 90th+ (Elite) ──────────┐    │
│      │ ░░░░░░░░░░░░░░░░░░░░░░░░░ │    │
│      │ 70-90th (Above Avg) ─────┐│    │
│      │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒││    │
│      │ 30-70th (Average) ───────┐││   │
│      │ ▓▓▓▓▓●▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│││   │
│      │           ●─●─●  (You)   │││   │
│      └───────────────────────────┘││   │
│      └─────────────────────────────┘│   │
│      └───────────────────────────────┘  │
│         Jan    Feb    Mar    Apr     →  │
└────────────────────────────────────────┘
```

**Advantages**:
- Shows trends relative to benchmarks over time
- Multiple athletes can be overlaid
- Clear visual of "moving up" through percentiles

#### Option 2: Gauge/Meter Display
```
         Elite (90th+)
             ↑
        ┌────●────┐  ← You are here
        │  ▓▓▓▓░░ │    82nd percentile
        └─────────┘
           ↓
     Below Average
```

**Advantages**:
- Instant snapshot for current performance
- Works well for summary cards
- Mobile-friendly

#### Option 3: Comparison Scatter Plot
```
┌────────────────────────────────────────┐
│ Power vs. Speed Profile                │
│                                        │
│ Power ↑                                │
│  (W)  │  High Power    │ Elite         │
│       │  Low Speed     │               │
│       │    ○           │    ●YOU       │
│       │  ○   ○  ○      │  ○  ○         │
│       ├────────────────┼───────────    │
│       │ Balanced       │ High Speed    │
│       │   ○  ○ ○       │ Low Power     │
│       │  ○      ○      │   ○           │
│       └────────────────┴───────────→   │
│                              Speed (m/s)│
└────────────────────────────────────────┘

Legend: ● You  ○ Teammates  ░ Normative range
```

**Advantages**:
- Shows relationships between metrics
- Identifies athletic profiles (power-dominant vs. speed-dominant)
- Contextualizes within team

---

### C. Derived Metric Display Pattern

**Example: Sayers Power Equation**

```
┌─────────────────────────────────────────┐
│ LOWER BODY POWER                         │
│                                          │
│ 4,250 Watts                              │
│ ●●●●○ 85th percentile                    │
│                                          │
│ Derived from:                            │
│ • Vertical Jump: 32.5" (85th %ile)       │
│ • Body Mass: 185 lbs                     │
│                                          │
│ ⓘ Calculated using Sayers equation      │
│   [Learn more →]                         │
└─────────────────────────────────────────┘
```

**"Learn more" expands to:**
```
┌─────────────────────────────────────────┐
│ METHODOLOGY                              │
│                                          │
│ Sayers Peak Power Equation:              │
│ Power (W) = 60.7 × Jump(cm) + 45.3 ×     │
│             Mass(kg) - 2055              │
│                                          │
│ Reference: Sayers et al. (1999)          │
│ "Cross-validation of three jump power    │
│ equations" Medicine & Science in Sports  │
│ & Exercise                               │
│                                          │
│ Validity: r=0.95 with force plate        │
│ measurements in athletes                 │
└─────────────────────────────────────────┘
```

**Design principles:**
- Hide methodology by default (simple view)
- Show input values and their percentiles
- Progressive disclosure for technical details
- Cite research for credibility

---

### D. Force-Velocity Profile Display

**Example: 30m Sprint with 5 Timing Gates**

```
┌──────────────────────────────────────────┐
│ SPRINT FORCE-VELOCITY PROFILE             │
│                                           │
│  Force ↑                                  │
│   (N)  │     ●                            │
│        │   ●   ●                          │
│        │ ●       ●                        │
│        │           Optimal ─┐             │
│        │             ░░░░░░░│░            │
│        └──────────────────────→           │
│                    Velocity (m/s)         │
│                                           │
│ Your Profile: Force-Dominant              │
│ FV Imbalance: -8% (optimal: ±10%)        │
│                                           │
│ Split Times:                              │
│ 0-5m:  1.12s  (78th %ile) ✓              │
│ 5-10m: 0.91s  (72nd %ile) ✓              │
│ 10-15m: 0.79s (65th %ile)                │
│ 15-20m: 0.74s (58th %ile)                │
│ 20-30m: 1.51s (45th %ile) ⚠              │
│                                           │
│ 💡 INSIGHT                                │
│ Your acceleration is strong, but max      │
│ velocity development lags. This suggests  │
│ power production is good, but velocity    │
│ mechanics need refinement.                │
│                                           │
│ 📋 RECOMMENDATIONS                        │
│ 1. Assisted sprints (downhill, band)     │
│    to train supramaximal velocities       │
│ 2. Reduce heavy resistance work          │
│ 3. Wicket runs for stride mechanics       │
│                                           │
│ ⓘ Learn about Force-Velocity Profiling   │
└──────────────────────────────────────────┘
```

**Key elements:**
- **Visual profile**: Scatter plot with optimal zone
- **Numeric summary**: FV imbalance percentage
- **Granular data**: Individual split percentiles
- **Contextualized insight**: Explains what the profile means
- **Specific recommendations**: Based on profile type

---

## Recommendation Formatting

### Structured Action Format

```
┌─────────────────────────────────────────┐
│ 📋 TRAINING RECOMMENDATIONS              │
│                                          │
│ HIGH PRIORITY                            │
│ 1. Sprint Mechanics Assessment           │
│    Why: 505 agility result suggests      │
│         deceleration issues              │
│    Who: Schedule with speed coach        │
│    When: Within 1 week                   │
│                                          │
│ MEDIUM PRIORITY                          │
│ 2. Plyometric Volume Increase            │
│    Why: Power declining 5% over 4 weeks  │
│    How: Add 1 session/week box jumps     │
│    Volume: 3×8 reps, 24" box             │
│                                          │
│ MAINTENANCE                              │
│ 3. Continue current strength program     │
│    Why: Lower body strength is excellent │
│    Note: Monitor for overtraining        │
└─────────────────────────────────────────┘
```

**Structure:**
- **Priority tiers**: High/Medium/Maintenance
- **What**: Clear action item
- **Why**: Insight that drives the recommendation
- **How/Who/When**: Specifics for implementation
- **Quantified when possible**: "Add 1 session/week" not "do more"

---

## Technical Implementation Considerations

### 1. Data Architecture

#### Option A: Calculate On-Demand
```typescript
// Compute derived metrics when athlete profile loads
const deriveMetrics = (rawMeasurements: Measurement[]) => {
  const vj = rawMeasurements.find(m => m.type === 'VERTICAL_JUMP')
  const mass = athlete.bodyWeight

  return {
    saversPower: calculateSayersPower(vj.value, mass),
    percentile: getBenchmarkPercentile('power', value, athlete.sport)
  }
}
```

**Pros**: Always fresh, no storage overhead, easy to modify formulas
**Cons**: Slower page loads, repeated calculations

#### Option B: Pre-compute and Cache
```typescript
// Background job updates derived metrics nightly
// Store in `derived_metrics` table
interface DerivedMetric {
  id: string
  athleteId: string
  metricType: 'SAYERS_POWER' | 'FV_PROFILE' | ...
  value: number
  percentile: number
  computedAt: Date
}
```

**Pros**: Instant loads, consistent calculations
**Cons**: Stale data if measurements updated, storage cost

#### Recommendation: Hybrid Approach
- **On-demand** for individual athlete views (cache in React Query)
- **Pre-computed** for team dashboards and historical trends
- Invalidate cache when new measurements added

---

### 2. Benchmark Data Sources

#### Normative Data Tables
```typescript
// Hard-coded research-based benchmarks
const POWER_BENCHMARKS = {
  'COLLEGE_FOOTBALL_WR': {
    '90th': 5200,
    '75th': 4800,
    '50th': 4200,
    '25th': 3700,
    '10th': 3200
  },
  'COLLEGE_FOOTBALL_DL': { ... },
  // ... per sport/position
}
```

**Sources**:
- Published research papers
- NCAA/NAIA performance databases
- Sport-specific governing bodies

**Data maintenance**:
- Version control for benchmark updates
- Cite sources in UI ("Based on Smith et al. 2022")

#### Dynamic Team Statistics
```typescript
// Calculate team percentiles in real-time
const teamPercentile = (value: number, teamValues: number[]) => {
  const sorted = teamValues.sort((a, b) => a - b)
  const rank = sorted.filter(v => v < value).length
  return (rank / sorted.length) * 100
}
```

---

### 3. Insight Generation

#### Phase 1: Rule-Based Logic
```typescript
const generateInsights = (metrics: DerivedMetrics) => {
  const insights: Insight[] = []

  // Strength: Top 25% in any metric
  if (metrics.saversPower.percentile > 75) {
    insights.push({
      type: 'STRENGTH',
      title: 'Explosive Power',
      description: `${metrics.saversPower.percentile}th percentile among ${athlete.position}`,
      recommendation: 'Maintain with plyometrics 2x/week'
    })
  }

  // Priority: Bottom 25% or declining trend
  if (metrics.saversPower.percentile < 25 || metrics.saversPower.trend === 'DECLINING') {
    insights.push({
      type: 'PRIORITY',
      title: 'Power Development Needed',
      description: 'Below position average and declining',
      recommendation: 'Add Olympic lifts 3x/week, consult strength coach'
    })
  }

  // Opportunity: Imbalance between related metrics
  if (metrics.acceleration.percentile > 70 && metrics.maxVelocity.percentile < 40) {
    insights.push({
      type: 'OPPORTUNITY',
      title: 'Max Velocity Development',
      description: 'Strong acceleration but max velocity lags',
      recommendation: 'Assisted sprints, wicket runs for mechanics'
    })
  }

  return insights
}
```

**Rules categories:**
1. **Absolute thresholds**: Percentile bands
2. **Trend analysis**: Improving/declining over time
3. **Ratio/imbalance detection**: Disproportionate metrics
4. **Injury risk flags**: Asymmetries, sudden declines

#### Phase 2: ML-Based Patterns (Future)
- Train models on coach feedback ("Was this insight useful?")
- Identify patterns in successful training progressions
- Personalize recommendations based on athlete history

---

### 4. Customization Layer

#### Coach-Defined Targets
```typescript
interface PerformanceTarget {
  athleteId: string
  metricType: string
  targetValue: number
  targetDate: Date
  rationale?: string // "Pre-season goal" or "Rehab milestone"
}
```

**UI for setting targets:**
```
┌─────────────────────────────────────────┐
│ SET PERFORMANCE TARGET                   │
│                                          │
│ Athlete: John Doe                        │
│ Metric: Vertical Jump Power             │
│                                          │
│ Current: 4,250W (85th %ile)              │
│ Target:  [4,500W        ]                │
│          94th percentile (stretch goal)  │
│                                          │
│ Target Date: [2024-08-01] (Pre-season)   │
│                                          │
│ Notes: [Improve reactive strength...]   │
│                                          │
│        [Cancel]  [Set Target]            │
└─────────────────────────────────────────┘
```

#### Custom Derived Metrics
```typescript
interface CustomMetric {
  name: string
  formula: string // "mass * vj * 0.6 - 2000" (sandbox eval)
  inputs: string[] // ["body_mass", "vertical_jump"]
  unit: string
  benchmarks?: Benchmark[]
}
```

**Use case**: Sport-specific calculations not in core system

---

## Phased Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Prove concept with single derived metric

- [ ] Create derived metrics calculation service
- [ ] Implement Sayers power equation
- [ ] Add power metric to athlete profile page
- [ ] Build percentile band chart component
- [ ] Hard-code college football WR benchmarks

**Success criteria**: Athletes can see power output with percentile on profile

---

### Phase 2: Insights Engine (Weeks 3-4)
**Goal**: Generate and display insights

- [ ] Build insight card components (green/yellow/red)
- [ ] Implement rule-based insight generation
- [ ] Add "Strengths" and "Areas for Development" sections to profile
- [ ] Create simple recommendation formatter
- [ ] Add team comparison percentiles

**Success criteria**: 3-5 insights auto-generated per athlete

---

### Phase 3: Force-Velocity Profiling (Weeks 5-6)
**Goal**: Advanced derived metric with split timing

- [ ] Implement FV profile calculation from timing gates
- [ ] Build FV scatter plot component
- [ ] Add split time percentile lookup
- [ ] Generate FV-specific insights and recommendations
- [ ] Create educational modal ("What is FV profiling?")

**Success criteria**: Coaches can view FV profiles for sprint tests

---

### Phase 4: Dedicated Insights Dashboard (Weeks 7-8)
**Goal**: Comprehensive insights page

- [ ] Build dedicated `/insights` page
- [ ] Implement coach view (team + individual split)
- [ ] Implement athlete view (personal focus)
- [ ] Add team-level insight aggregation
- [ ] Create priority ranking algorithm

**Success criteria**: Coaches can triage 20+ athletes quickly

---

### Phase 5: Customization & Expansion (Weeks 9-10)
**Goal**: Coach control and breadth

- [ ] Add coach target-setting UI
- [ ] Expand benchmark database (10+ sport/position combos)
- [ ] Add 3+ more derived metrics (RSI, relative strength, etc.)
- [ ] Implement trend analysis (improving/declining)
- [ ] Add "Export insights as PDF" feature

**Success criteria**: Coaches can customize benchmarks and targets

---

## UI/UX Best Practices

### Accessibility
- **WCAG AA compliance**: Color + icon + text for insight types
- **Keyboard navigation**: All interactive elements focusable
- **Screen reader support**: Proper ARIA labels for charts
- **Color blindness**: Don't rely solely on green/yellow/red

### Performance
- **Lazy load**: Charts render only when scrolled into view
- **Paginate**: Team insights table for 50+ athletes
- **Debounce**: Filtering/searching insights
- **Cache**: React Query with 5-minute stale time

### Mobile Optimization
- **Stack cards vertically** on mobile
- **Collapsible sections** for detailed metrics
- **Touch-friendly targets** (44×44px minimum)
- **Simplified charts** for small screens

### Progressive Enhancement
- **Works without JS**: Show static percentiles
- **Works on slow connections**: Server-render insights
- **Graceful degradation**: Missing benchmarks → show only team comparison

---

## Success Metrics

### User Engagement
- % of coaches viewing insights page weekly
- Average time spent on insights vs. raw data
- Click-through rate on recommendations

### Utility Validation
- Coach survey: "How often do insights inform your programming?" (1-5)
- Athlete survey: "Do recommendations help you improve?" (1-5)
- Feature adoption: % of athletes with custom targets set

### Performance Impact
- Correlation between insight-driven training and metric improvements
- A/B test: Athletes with insights vs. without

---

## Example User Flows

### Flow 1: Coach Reviews Team
1. Navigate to team page
2. See summary: "5 athletes below target in acceleration"
3. Click into insights dashboard
4. View team histogram showing distribution
5. Select flagged athlete
6. Review individual insights
7. Set custom target for improvement
8. Export insights as PDF for discussion

### Flow 2: Athlete Views Personal Progress
1. Log in to athlete portal
2. Dashboard shows: "💪 Top Priority: Acceleration development"
3. Click to view details
4. See FV profile showing force-dominant pattern
5. Read recommendation: "Assisted sprints 2x/week"
6. View educational video on assisted sprints
7. Track progress over 4 weeks
8. See insight update: "Improving - Max velocity up 8%"

---

## Questions for Future Consideration

1. **Insight fatigue**: How many insights before overwhelming users? Max 5-7 per athlete?
2. **Coach override**: Allow coaches to dismiss or modify insights?
3. **Historical tracking**: Show "insights addressed" vs. "still pending"?
4. **Notifications**: Alert coaches when athlete moves into "priority" status?
5. **Collaboration**: Allow athletes to mark recommendations as "completed" or "in progress"?
6. **Integration**: Export recommendations to training planning software?

---

## References & Resources

### Research Citations for Derived Metrics
- **Sayers Power Equation**: Sayers SP, et al. (1999). Cross-validation of three jump power equations. Med Sci Sports Exerc.
- **Force-Velocity Profiling**: Morin JB, Samozino P. (2016). Interpreting power-force-velocity profiles for individualized and specific training. Int J Sports Physiol Perform.
- **Reactive Strength Index**: Flanagan EP, Comyns TM. (2008). The use of contact time and the reactive strength index to optimize fast stretch-shortening cycle training. Strength Cond J.

### Design Inspiration
- **TrainingPeaks**: Power/TSS insights and fitness trend analysis
- **Whoop**: Recovery insights and strain recommendations
- **Strava**: Segment comparisons and personal records
- **Catapult**: Athlete load monitoring and risk indicators

### Technical Libraries
- **Chart.js**: Benchmark overlays, scatter plots, radar charts
- **Recharts**: Alternative with better React integration
- **D3.js**: Custom FV profile visualizations
- **React Query**: Cache derived metrics efficiently

---

## Conclusion

This design balances **simplicity** (plain language, actionable insights) with **depth** (optional methodology, technical details) to serve both coaches and athletes. The phased approach allows iterative validation of assumptions while building toward a comprehensive insights platform.

**Next steps**:
1. Review with stakeholders (coaches, athletes)
2. Create Figma mockups for key components
3. Begin Phase 1 implementation (Sayers power equation)
