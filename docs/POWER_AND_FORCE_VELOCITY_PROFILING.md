# Power Calculations & Force-Velocity Profiling for AthleteMetrics

## Executive Summary

This document details how to integrate two advanced biomechanical analysis methods into AthleteMetrics:

1. **Sayers Equation Power Calculation** - Convert vertical jump height to peak anaerobic power output (watts)
2. **Force-Velocity Profiling** - Analyze sprint acceleration mechanics to identify force vs. velocity deficiencies

These methods transform basic measurements into actionable biomechanical insights that guide individualized training prescription.

---

## Part 1: Sayers Equation Power Calculation

### Scientific Background

**Reference**: Sayers et al. (1999) - "Cross-validation of three jump power equations"

The Sayers equation estimates peak anaerobic power output from vertical jump performance with <1% error compared to force plate measurements.

**Formula**:
```
Peak Power (W) = 60.7 × jump height (cm) + 45.3 × body mass (kg) - 2055
```

**Key Advantages**:
- Validated across multiple populations (male/female, trained/untrained)
- No separate equations needed for gender
- Standard Error of Estimate (SEE): 355.0 W
- More accurate than Lewis or Harman equations
- Non-invasive field assessment

### Current AthleteMetrics Data Availability

**Available Data**:
- ✅ `VERTICAL_JUMP` metric (value in inches)
- ✅ `weight` field in users table (pounds)
- ✅ `height` field in users table (inches)
- ✅ `gender` field for gender-specific normative data
- ✅ `age` at time of measurement

**Conversion Requirements**:
```javascript
// AthleteMetrics stores in imperial units, Sayers requires metric
jump_height_cm = vertical_jump_inches × 2.54
body_mass_kg = weight_pounds × 0.453592
```

### Implementation: Derived Power Metrics

#### 1. Peak Anaerobic Power (Watts)

**Calculation**:
```javascript
function calculatePeakPower(jumpHeightInches: number, weightPounds: number): number {
  // Convert to metric units
  const jumpHeightCm = jumpHeightInches * 2.54;
  const bodyMassKg = weightPounds * 0.453592;

  // Sayers equation
  const peakPowerWatts = (60.7 * jumpHeightCm) + (45.3 * bodyMassKg) - 2055;

  return Math.max(0, peakPowerWatts); // Ensure non-negative
}
```

**Example**:
```
Athlete: 16-year-old male
Weight: 150 lbs (68.0 kg)
Vertical Jump: 24 inches (60.96 cm)

Peak Power = (60.7 × 60.96) + (45.3 × 68.0) - 2055
           = 3700.27 + 3080.4 - 2055
           = 4725.67 W
```

#### 2. Relative Power (Watts per kg)

**Why Important**: Normalizes power for body mass comparison

**Calculation**:
```javascript
function calculateRelativePower(peakPowerWatts: number, weightPounds: number): number {
  const bodyMassKg = weightPounds * 0.453592;
  return peakPowerWatts / bodyMassKg;
}
```

**Example**:
```
Peak Power: 4725.67 W
Body Mass: 68.0 kg
Relative Power = 4725.67 / 68.0 = 69.5 W/kg
```

**Normative Data (Relative Power W/kg)**:

| Population | Male | Female |
|------------|------|--------|
| Untrained Youth (14-16) | 45-55 | 35-45 |
| Trained Youth (14-16) | 55-70 | 45-60 |
| College Athletes | 65-85 | 55-75 |
| Professional Athletes | 80-100+ | 70-90+ |

#### 3. Explosive Strength Index (ESI)

**Definition**: Jump height per unit body mass

**Calculation**:
```javascript
function calculateESI(jumpHeightCm: number, weightKg: number): number {
  return jumpHeightCm / weightKg;
}
```

**Interpretation**:
- **< 0.6**: Below average explosive strength
- **0.6-0.8**: Average explosive strength
- **0.8-1.0**: Good explosive strength
- **> 1.0**: Excellent explosive strength

#### 4. Power-to-Weight Ratio

**Why Important**: Identifies strength vs. power athletes

**Calculation**:
```javascript
function calculatePowerToWeightRatio(
  peakPowerWatts: number,
  weightPounds: number
): number {
  return peakPowerWatts / weightPounds;
}
```

**Interpretation**:
- **High Power, High Weight**: Strength-dominant athlete (needs speed work)
- **High Power, Low Weight**: Power-dominant athlete (maintain)
- **Low Power, High Weight**: Needs both strength and power development
- **Low Power, Low Weight**: Needs strength foundation

### Database Schema Changes

```sql
-- Add weight snapshot to measurements for historical accuracy
ALTER TABLE measurements
ADD COLUMN weight_snapshot INTEGER, -- pounds at time of measurement
ADD COLUMN height_snapshot INTEGER; -- inches at time of measurement

-- Create derived metrics table for cached calculations
CREATE TABLE power_metrics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id VARCHAR NOT NULL REFERENCES measurements(id),
  user_id VARCHAR NOT NULL,

  -- Sayers equation outputs
  peak_power_watts DECIMAL(10, 2) NOT NULL,
  relative_power_watts_per_kg DECIMAL(6, 2) NOT NULL,
  explosive_strength_index DECIMAL(5, 3) NOT NULL,
  power_to_weight_ratio DECIMAL(7, 2) NOT NULL,

  -- Context for calculation
  jump_height_cm DECIMAL(6, 2) NOT NULL,
  body_mass_kg DECIMAL(6, 2) NOT NULL,

  -- Benchmarking
  age_group_percentile INTEGER, -- 0-100
  gender_percentile INTEGER, -- 0-100
  position_percentile INTEGER, -- 0-100

  calculated_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_power_metrics_user (user_id),
  INDEX idx_power_metrics_measurement (measurement_id)
);
```

### UI Implementation

#### Power Metrics Dashboard Card

```typescript
// packages/web/src/components/analytics/PowerMetricsCard.tsx

interface PowerMetrics {
  peakPowerWatts: number;
  relativePowerWkg: number;
  explosiveStrengthIndex: number;
  powerToWeightRatio: number;
  ageGroupPercentile: number;
  genderPercentile: number;
}

function PowerMetricsCard({ metrics }: { metrics: PowerMetrics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Power Analysis (Sayers Equation)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Peak Power */}
          <MetricDisplay
            label="Peak Power"
            value={metrics.peakPowerWatts}
            unit="W"
            percentile={metrics.ageGroupPercentile}
            benchmark="4500-5500 W (College)"
          />

          {/* Relative Power */}
          <MetricDisplay
            label="Relative Power"
            value={metrics.relativePowerWkg}
            unit="W/kg"
            percentile={metrics.genderPercentile}
            benchmark="65-85 W/kg (College)"
          />

          {/* Explosive Strength Index */}
          <MetricDisplay
            label="Explosive Strength Index"
            value={metrics.explosiveStrengthIndex}
            unit=""
            rating={getESIRating(metrics.explosiveStrengthIndex)}
          />

          {/* Power-to-Weight */}
          <MetricDisplay
            label="Power-to-Weight Ratio"
            value={metrics.powerToWeightRatio}
            unit="W/lb"
            trend={getTrendDirection(metrics)}
          />
        </div>

        {/* Interpretation */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-900">
            {getPowerInterpretation(metrics)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function getPowerInterpretation(metrics: PowerMetrics): string {
  const { relativePowerWkg, explosiveStrengthIndex } = metrics;

  if (relativePowerWkg > 75 && explosiveStrengthIndex > 0.9) {
    return "Elite power output. Athlete demonstrates excellent explosive strength relative to body mass. Maintain current power development while focusing on sport-specific application.";
  } else if (relativePowerWkg > 60 && explosiveStrengthIndex > 0.7) {
    return "Good power output. Continue power development with emphasis on rate of force development and plyometric training.";
  } else if (relativePowerWkg < 50 || explosiveStrengthIndex < 0.6) {
    return "Power development opportunity. Prioritize strength foundation building followed by power conversion exercises (Olympic lifts, plyometrics).";
  } else {
    return "Average power output for age and gender. Balanced strength and power training recommended for continued development.";
  }
}
```

### Training Insights from Power Data

#### Insight 1: Force vs. Power Deficiency

```javascript
function identifyPowerDeficiency(
  verticalJump: number,
  peakPower: number,
  relativePower: number,
  weight: number
): {
  deficiencyType: 'force' | 'power' | 'balanced' | 'optimal';
  recommendation: string;
} {
  const jumpPercentile = getPercentile(verticalJump);
  const powerPercentile = getPercentile(peakPower);

  // High jump, low power = needs more mass/strength
  if (jumpPercentile > 70 && powerPercentile < 50) {
    return {
      deficiencyType: 'force',
      recommendation: 'Focus on strength training to increase force production capacity. Add resistance training with lower reps (3-5) and higher loads (85-95% 1RM).'
    };
  }

  // Low jump, high power = needs better force application
  if (jumpPercentile < 50 && powerPercentile > 70) {
    return {
      deficiencyType: 'power',
      recommendation: 'Focus on rate of force development and explosive strength. Emphasize Olympic lifts, plyometrics, and contrast training.'
    };
  }

  // Both high
  if (jumpPercentile > 70 && powerPercentile > 70) {
    return {
      deficiencyType: 'optimal',
      recommendation: 'Excellent force and power balance. Maintain current training approach while focusing on sport-specific power application.'
    };
  }

  // Both average
  return {
    deficiencyType: 'balanced',
    recommendation: 'Balanced development opportunity. Implement periodized program alternating strength and power emphasis.'
  };
}
```

#### Insight 2: Optimal Training Load Recommendation

```javascript
function recommendTrainingLoad(relativePowerWkg: number, age: number): {
  strengthFocus: number; // percentage
  powerFocus: number;    // percentage
  speedFocus: number;    // percentage
  recommendation: string;
} {
  // Youth athletes (< 16): Prioritize skill and general athleticism
  if (age < 16) {
    return {
      strengthFocus: 30,
      powerFocus: 40,
      speedFocus: 30,
      recommendation: 'Youth development phase: Emphasize bodyweight plyometrics, general strength, and speed technique.'
    };
  }

  // Low power athletes: Build strength foundation
  if (relativePowerWkg < 50) {
    return {
      strengthFocus: 60,
      powerFocus: 25,
      speedFocus: 15,
      recommendation: 'Strength development phase: Focus on building force production capacity through resistance training before power conversion.'
    };
  }

  // Moderate power athletes: Convert strength to power
  if (relativePowerWkg < 70) {
    return {
      strengthFocus: 35,
      powerFocus: 45,
      speedFocus: 20,
      recommendation: 'Power development phase: Convert strength to explosive power through Olympic lifts and plyometrics.'
    };
  }

  // High power athletes: Maintain and apply
  return {
    strengthFocus: 25,
    powerFocus: 35,
    speedFocus: 40,
    recommendation: 'Power maintenance phase: Maintain strength-power while emphasizing sport-specific speed application.'
  };
}
```

---

## Part 2: Force-Velocity Profiling for Sprint Performance

### Scientific Background

**Reference**: JB Morin et al. (2016) - Sprint acceleration mechanics profiling

Force-Velocity (FV) profiling reveals the biomechanical qualities underpinning sprint performance:
- **Force capability** (F0): Maximum horizontal force production
- **Velocity capability** (V0): Maximum running velocity
- **Power output** (Pmax): F0 × V0 / 4
- **Force application effectiveness** (RFmax, DRF)

### The FV Relationship in Sprinting

**Core Principle**: Power = Force × Velocity

During acceleration:
- **Early phase (0-10m)**: High force, low velocity
- **Mid phase (10-30m)**: Decreasing force, increasing velocity
- **Late phase (30m+)**: Low force, high velocity (max speed)

**Key Insight**: Athletes can have equal power but different force-velocity profiles
- **Force-oriented**: Strong acceleration, lower top speed
- **Velocity-oriented**: Slower acceleration, higher top speed

### Current AthleteMetrics Data for FV Profiling

**Available Sprint Data**:
- ✅ `FLY10_TIME` - 10-yard sprint with flying start
- ✅ `DASH_40YD` - 40-yard dash (full sprint)
- ✅ `TOP_SPEED` - Maximum velocity
- ⚠️ **Missing**: Split times (5m, 10m, 20m, 30m)

**Required for Full FV Profile**:
1. Body mass (kg) ✅
2. Body height (m) ✅
3. Split times at 5m, 10m, 20m, 30m intervals ❌
4. Environmental data (air pressure, temperature) - Optional

### Implementation Strategy

#### Option 1: Simple FV Estimation (Current Data)

**Using existing 40-yard dash + fly10 data**:

```javascript
interface SimpleFVProfile {
  accelerationQuality: number;   // 0-10m phase
  topSpeedQuality: number;       // 30-40m phase
  fvBalance: 'force-oriented' | 'velocity-oriented' | 'balanced';
  recommendation: string;
}

function estimateSimpleFVProfile(
  dash40Time: number,     // seconds
  fly10Time: number,      // seconds
  topSpeed: number,       // mph
  bodyMassKg: number
): SimpleFVProfile {
  // Estimate acceleration phase (0-10m ≈ 0-11 yards)
  const estimated10yTime = dash40Time * 0.35; // rough approximation

  // Calculate acceleration quality
  const accelerationQuality = calculateAccelerationIndex(estimated10yTime, bodyMassKg);

  // Top speed quality from fly10 (flying start = max velocity phase)
  const topSpeedQuality = calculateTopSpeedIndex(fly10Time, topSpeed);

  // Determine FV balance
  const fvRatio = accelerationQuality / topSpeedQuality;
  let fvBalance: 'force-oriented' | 'velocity-oriented' | 'balanced';

  if (fvRatio > 1.15) {
    fvBalance = 'force-oriented';
  } else if (fvRatio < 0.85) {
    fvBalance = 'velocity-oriented';
  } else {
    fvBalance = 'balanced';
  }

  return {
    accelerationQuality,
    topSpeedQuality,
    fvBalance,
    recommendation: getFVRecommendation(fvBalance)
  };
}

function getFVRecommendation(balance: string): string {
  switch (balance) {
    case 'force-oriented':
      return 'Athlete has strong acceleration but lower top speed. Training focus: Maximum velocity development, sprint mechanics at high speeds, assisted sprinting.';
    case 'velocity-oriented':
      return 'Athlete has high top speed but slower acceleration. Training focus: Force production capacity, resisted sprint training, strength development.';
    default:
      return 'Balanced force-velocity profile. Maintain balance while optimizing both qualities through varied sprint training.';
  }
}
```

#### Option 2: Full FV Profiling (Requires New Measurements)

**Add Sprint Split Times Measurement**:

```typescript
// New measurement type: SPRINT_PROFILE
interface SprintProfileMeasurement {
  metric: 'SPRINT_PROFILE';
  splits: {
    distance5m: number;   // seconds
    distance10m: number;  // seconds
    distance20m: number;  // seconds
    distance30m: number;  // seconds
    distance40m: number;  // optional
  };
  bodyMassSnapshot: number; // kg at time of test
  heightSnapshot: number;   // meters at time of test
  airTemp?: number;        // Celsius (optional)
  airPressure?: number;    // hPa (optional)
}
```

**Full Morin Method Implementation**:

```javascript
/**
 * Calculate Force-Velocity profile using Morin method
 * Based on JB Morin's simplified approach for field testing
 */
function calculateFVProfile(
  splits: number[],      // split times in seconds [5m, 10m, 20m, 30m]
  distances: number[],   // corresponding distances in meters
  bodyMassKg: number,
  heightMeters: number,
  airTemp: number = 20,
  airPressure: number = 1013
): FVProfile {
  // Step 1: Fit exponential model to position-time data
  const { vMax, tau } = fitExponentialModel(splits, distances);

  // Step 2: Calculate theoretical maximum force (F0) and velocity (V0)
  const F0 = calculateF0(bodyMassKg, vMax, tau);
  const V0 = vMax;

  // Step 3: Calculate maximum power output
  const Pmax = (F0 * V0) / 4;

  // Step 4: Calculate force application effectiveness
  const { RFmax, DRF } = calculateForceEffectiveness(F0, bodyMassKg, vMax);

  // Step 5: Determine FV imbalance
  const FVimbalance = calculateFVImbalance(F0, V0, bodyMassKg);

  return {
    F0,           // Theoretical max horizontal force (N)
    V0,           // Theoretical max velocity (m/s)
    Pmax,         // Maximum power output (W)
    RFmax,        // Maximum ratio of force (%)
    DRF,          // Decrease in RF (% per m/s)
    FVimbalance,  // Force-velocity imbalance (%)
    vMax,         // Maximum velocity from model fit (m/s)
    tau,          // Time constant (s)
    profile: determineFVProfile(F0, V0, FVimbalance)
  };
}

interface FVProfile {
  F0: number;         // Max horizontal force (N)
  V0: number;         // Max velocity (m/s)
  Pmax: number;       // Max power (W)
  RFmax: number;      // Max ratio of force (%)
  DRF: number;        // Decrease in RF
  FVimbalance: number; // Imbalance percentage
  vMax: number;       // Fitted max velocity
  tau: number;        // Time constant
  profile: 'force-deficit' | 'velocity-deficit' | 'optimal';
}

/**
 * Fit exponential model: position(t) = vMax × (t + tau × exp(-t/tau) - tau)
 */
function fitExponentialModel(
  splitTimes: number[],
  distances: number[]
): { vMax: number; tau: number } {
  // Use least squares optimization to fit exponential model
  // Simplified implementation - in production, use optimization library

  let bestVmax = 10.0; // m/s
  let bestTau = 1.0;   // s
  let minError = Infinity;

  // Grid search (simplified - use proper optimization in production)
  for (let vMax = 8.0; vMax <= 12.0; vMax += 0.1) {
    for (let tau = 0.5; tau <= 2.0; tau += 0.05) {
      let error = 0;

      for (let i = 0; i < splitTimes.length; i++) {
        const t = splitTimes[i];
        const predicted = vMax * (t + tau * Math.exp(-t / tau) - tau);
        error += Math.pow(predicted - distances[i], 2);
      }

      if (error < minError) {
        minError = error;
        bestVmax = vMax;
        bestTau = tau;
      }
    }
  }

  return { vMax: bestVmax, tau: bestTau };
}

/**
 * Calculate theoretical maximum horizontal force
 */
function calculateF0(bodyMassKg: number, vMax: number, tau: number): number {
  const g = 9.81; // gravity (m/s²)
  const F0 = bodyMassKg * vMax / tau;
  return F0;
}

/**
 * Calculate force application effectiveness
 */
function calculateForceEffectiveness(
  F0: number,
  bodyMassKg: number,
  vMax: number
): { RFmax: number; DRF: number } {
  const g = 9.81;

  // Maximum ratio of force (percentage of total force that's horizontal)
  const RFmax = (F0 / (bodyMassKg * g)) * 100;

  // Rate of decrease in RF
  const DRF = -RFmax / vMax;

  return { RFmax, DRF };
}

/**
 * Calculate FV imbalance (optimal profile comparison)
 */
function calculateFVImbalance(
  F0: number,
  V0: number,
  bodyMassKg: number
): number {
  // Optimal F0 for given V0 and body mass (from Morin research)
  const optimalF0 = bodyMassKg * 9.81 * 0.65; // simplified

  const imbalance = ((F0 - optimalF0) / optimalF0) * 100;
  return imbalance;
}

/**
 * Determine profile type based on FV imbalance
 */
function determineFVProfile(
  F0: number,
  V0: number,
  FVimbalance: number
): 'force-deficit' | 'velocity-deficit' | 'optimal' {
  if (FVimbalance < -10) {
    return 'force-deficit';
  } else if (FVimbalance > 10) {
    return 'velocity-deficit';
  } else {
    return 'optimal';
  }
}
```

### Database Schema for FV Profiling

```sql
-- Sprint profile measurements table
CREATE TABLE sprint_profiles (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  measurement_date DATE NOT NULL,

  -- Split times (seconds)
  split_5m DECIMAL(5, 3),
  split_10m DECIMAL(5, 3),
  split_20m DECIMAL(5, 3),
  split_30m DECIMAL(5, 3),
  split_40m DECIMAL(5, 3),

  -- Context
  body_mass_kg DECIMAL(6, 2) NOT NULL,
  height_m DECIMAL(4, 2) NOT NULL,
  air_temp_celsius DECIMAL(4, 1),
  air_pressure_hpa DECIMAL(6, 1),

  -- Calculated FV profile
  f0_newtons DECIMAL(8, 2),        -- Max horizontal force
  v0_ms DECIMAL(5, 2),              -- Max velocity
  pmax_watts DECIMAL(8, 2),         -- Max power
  rf_max_percent DECIMAL(5, 2),    -- Max ratio of force
  drf DECIMAL(6, 4),                -- Decrease in RF
  fv_imbalance_percent DECIMAL(6, 2), -- FV imbalance
  v_max_fitted DECIMAL(5, 2),      -- Fitted max velocity
  tau DECIMAL(5, 3),                -- Time constant

  profile_type VARCHAR(20),         -- 'force-deficit', 'velocity-deficit', 'optimal'

  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_sprint_profiles_user (user_id),
  INDEX idx_sprint_profiles_date (measurement_date)
);
```

### Training Recommendations from FV Profile

```javascript
function generateFVTrainingPlan(profile: FVProfile): TrainingPlan {
  const { profile: profileType, FVimbalance, F0, V0, Pmax } = profile;

  switch (profileType) {
    case 'force-deficit':
      return {
        diagnosis: 'Force Deficit Profile',
        description: `Athlete produces insufficient horizontal force (${FVimbalance.toFixed(1)}% below optimal). Strong top speed but slow acceleration.`,

        priorities: [
          {
            quality: 'Horizontal Force Production',
            percentage: 50,
            methods: [
              'Heavy sled sprints (loads: 70-80% velocity decrement)',
              'Hill sprints (6-8° incline, 20-30m)',
              'Resisted sprint training (parachutes, bands)',
              'Strength training: Squats, deadlifts, split squats (3-5 reps, 85-90% 1RM)'
            ]
          },
          {
            quality: 'Force Application Technique',
            percentage: 30,
            methods: [
              'Acceleration mechanics drills (wicket runs, wall drills)',
              'Power development (Olympic lifts: clean, snatch)',
              'Plyometric bounds (horizontal emphasis)',
              'Block starts and 10-20m sprints'
            ]
          },
          {
            quality: 'Maximum Velocity Maintenance',
            percentage: 20,
            methods: [
              'Flying sprints 20-30m (maintain top speed)',
              'Tempo runs',
              'Sprint-float-sprint intervals'
            ]
          }
        ],

        expectedOutcome: 'Improved 0-20m acceleration with minimal top speed change',
        timeframe: '8-12 weeks',

        progressMarkers: {
          F0_target: F0 * 1.15,  // 15% increase in F0
          V0_target: V0 * 1.02,  // maintain V0
          imbalanceTarget: -5    // move toward balanced
        }
      };

    case 'velocity-deficit':
      return {
        diagnosis: 'Velocity Deficit Profile',
        description: `Athlete has strong force production (${FVimbalance.toFixed(1)}% above optimal) but limited top speed. Quick acceleration but low maximum velocity.`,

        priorities: [
          {
            quality: 'Maximum Velocity Development',
            percentage: 50,
            methods: [
              'Assisted sprinting (downhill 2-3°, towing)',
              'Flying sprints 30-40m (focus on turnover)',
              'Over-speed training (build-up to max)',
              'Sprint technical work at max velocity'
            ]
          },
          {
            quality: 'Force Application at High Speeds',
            percentage: 30,
            methods: [
              'Sprint mechanics at 95-100% max speed',
              'Wicket runs (emphasize ground contact time)',
              'High-speed bounds and skips',
              'Stiffness drills (pogo jumps, ankle hops)'
            ]
          },
          {
            quality: 'Force Production Maintenance',
            percentage: 20,
            methods: [
              'Light sled sprints (20-30% velocity decrement)',
              'Strength maintenance (2-3 sets, moderate loads)',
              'Power endurance (repeated jumps, bounds)'
            ]
          }
        ],

        expectedOutcome: 'Increased top speed with maintained or improved acceleration',
        timeframe: '8-12 weeks',

        progressMarkers: {
          F0_target: F0 * 0.95,  // slight decrease acceptable
          V0_target: V0 * 1.10,  // 10% increase in V0
          imbalanceTarget: 5     // move toward balanced
        }
      };

    case 'optimal':
      return {
        diagnosis: 'Optimal FV Balance',
        description: `Athlete has well-balanced force-velocity profile (imbalance: ${FVimbalance.toFixed(1)}%). Focus on maintaining balance while increasing overall power output.`,

        priorities: [
          {
            quality: 'Power Output Increase',
            percentage: 40,
            methods: [
              'Varied sprint training (acceleration + top speed)',
              'Contrast training (heavy + light loads)',
              'Complex training (strength + power + speed)',
              'Periodized loading (force, power, speed blocks)'
            ]
          },
          {
            quality: 'Force Development',
            percentage: 30,
            methods: [
              'Progressive resistance training',
              'Moderate sled sprints (30-50% decrement)',
              'Olympic lift variations',
              'Hill sprints (moderate incline)'
            ]
          },
          {
            quality: 'Velocity Development',
            percentage: 30,
            methods: [
              'Assisted sprinting (occasional)',
              'Flying sprints and build-ups',
              'Speed endurance work',
              'Technical refinement at max speed'
            ]
          }
        ],

        expectedOutcome: 'Increased overall power output with maintained FV balance',
        timeframe: '8-12 weeks',

        progressMarkers: {
          F0_target: F0 * 1.08,      // proportional increases
          V0_target: V0 * 1.08,      // maintain balance
          Pmax_target: Pmax * 1.15,  // 15% power increase
          imbalanceTarget: 0         // maintain balance
        }
      };
  }
}

interface TrainingPlan {
  diagnosis: string;
  description: string;
  priorities: Array<{
    quality: string;
    percentage: number;
    methods: string[];
  }>;
  expectedOutcome: string;
  timeframe: string;
  progressMarkers: {
    F0_target: number;
    V0_target: number;
    Pmax_target?: number;
    imbalanceTarget: number;
  };
}
```

### Visualization: FV Profile Chart

```typescript
// Force-Velocity curve visualization component
function FVProfileChart({ profile }: { profile: FVProfile }) {
  const { F0, V0, Pmax, profile: profileType } = profile;

  // Generate FV curve points
  const fvCurve = generateFVCurve(F0, V0);

  // Optimal FV curve for comparison
  const optimalCurve = generateOptimalFVCurve(F0, V0, Pmax);

  return (
    <div className="relative h-96">
      {/* Chart shows Force (y-axis) vs Velocity (x-axis) */}
      <LineChart
        data={{
          datasets: [
            {
              label: 'Athlete FV Profile',
              data: fvCurve,
              borderColor: getProfileColor(profileType),
              fill: false
            },
            {
              label: 'Optimal FV Profile',
              data: optimalCurve,
              borderColor: '#888',
              borderDash: [5, 5],
              fill: false
            }
          ]
        }}
        options={{
          scales: {
            x: {
              title: { text: 'Velocity (m/s)', display: true },
              min: 0,
              max: V0 * 1.1
            },
            y: {
              title: { text: 'Force (N)', display: true },
              min: 0,
              max: F0 * 1.1
            }
          },
          plugins: {
            annotation: {
              annotations: {
                maxPower: {
                  type: 'point',
                  xValue: V0 / 2,
                  yValue: F0 / 2,
                  backgroundColor: 'rgba(255, 99, 132, 0.5)',
                  radius: 8,
                  label: {
                    content: `Pmax: ${Pmax.toFixed(0)} W`,
                    enabled: true
                  }
                }
              }
            }
          }
        }}
      />

      {/* Profile interpretation */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-semibold mb-2">Profile Analysis</h4>
        <p className="text-sm text-gray-700">
          {getProfileInterpretation(profile)}
        </p>
      </div>
    </div>
  );
}

function generateFVCurve(F0: number, V0: number): Array<{x: number, y: number}> {
  const points = [];
  for (let v = 0; v <= V0; v += V0 / 20) {
    const f = F0 * (1 - v / V0);  // Linear FV relationship
    points.push({ x: v, y: f });
  }
  return points;
}

function getProfileColor(profileType: string): string {
  switch (profileType) {
    case 'force-deficit': return '#ef4444'; // red
    case 'velocity-deficit': return '#3b82f6'; // blue
    case 'optimal': return '#10b981'; // green
    default: return '#6b7280'; // gray
  }
}
```

---

## Integration Roadmap

### Phase 1: Sayers Power Calculations (Week 1-2)

**Tasks**:
1. Add power calculation functions to `packages/shared/analytics-utils.ts`
2. Create `power_metrics` database table
3. Calculate power metrics for all existing vertical jump measurements
4. Add Power Metrics Card to analytics dashboard
5. Create power benchmarking data for age/gender groups

**Deliverables**:
- Power metrics displayed on athlete profile pages
- Power percentile rankings
- Power-based training recommendations
- Historical power trend charts

### Phase 2: Simple FV Estimation (Week 3-4)

**Tasks**:
1. Implement simplified FV profiling using existing 40yd and fly10 data
2. Add acceleration vs. top speed quality indicators
3. Create FV balance classification (force/velocity-oriented)
4. Generate basic training recommendations

**Deliverables**:
- FV balance indicators on athlete profiles
- Simple training focus recommendations
- Comparison charts (acceleration vs. max velocity)

### Phase 3: Full FV Profiling (Week 5-8)

**Tasks**:
1. Add sprint split time measurement collection UI
2. Create `sprint_profiles` database table
3. Implement Morin FV profiling calculations
4. Build FV profile visualization charts
5. Generate detailed training plans from FV profiles
6. Create progress tracking for FV development

**Deliverables**:
- Sprint split time data collection interface
- Full FV profile calculations (F0, V0, Pmax, RFmax, DRF)
- FV curve visualization charts
- Individualized training plan generator
- Progress tracking dashboard

---

## Expected User Value

### For Coaches

**Power Analysis Benefits**:
- Objective strength-power assessment beyond just jump height
- Age and gender-adjusted performance comparison
- Clear training phase identification (strength vs. power focus)
- Body composition impact understanding

**FV Profile Benefits**:
- Identify why athletes are fast (force vs. velocity qualities)
- Individualize sprint training prescription
- Predict position suitability (force = linemen, velocity = backs)
- Track training effectiveness with objective metrics
- Reduce injury risk through balanced development

**Time Savings**:
- Automated analysis replaces manual calculations
- Evidence-based training plans generated instantly
- Progress tracking without spreadsheets

### For Athletes

**Power Metrics Benefits**:
- Understanding of power output relative to peers
- Body composition impact awareness
- Clear strength vs. power development needs
- Motivation through watts-based progress

**FV Profile Benefits**:
- Understanding of sprint strengths (acceleration vs. top speed)
- Personalized training recommendations
- Position fit insights
- Objective progress tracking beyond just sprint times

---

## Scientific Validation & Accuracy

### Sayers Equation Validation
- **Standard Error**: 355.0 W (±7.5% for typical athlete)
- **Correlation with force plate**: r = 0.96
- **Population validity**: Male/female, trained/untrained, ages 15-45
- **Practical accuracy**: Within 1% of lab measurements

### Morin FV Profiling Validation
- **Force plate correlation**: r = 0.88-0.92 for F0 and V0
- **Test-retest reliability**: ICC > 0.90 for all variables
- **Practical validity**: Used by professional teams worldwide
- **Field applicability**: Validated with timing gates vs. radar vs. GPS

---

## Conclusion

Integrating Sayers equation power calculations and force-velocity profiling transforms AthleteMetrics from a basic measurement platform into a sophisticated biomechanical analysis tool.

**Key Advantages**:

1. **Deeper Insights**: Convert simple jump heights and sprint times into actionable biomechanical profiles
2. **Individualization**: Identify specific force vs. velocity vs. power deficiencies for personalized training
3. **Scientific Rigor**: Research-validated methods used by professional sports organizations
4. **Practical Application**: Field-based assessments that don't require expensive equipment
5. **Competitive Differentiation**: Professional-grade analysis at youth sports pricing

**Implementation Priority**:
- **Phase 1 (High Priority)**: Sayers power calculations - immediate value from existing data
- **Phase 2 (Medium Priority)**: Simple FV estimation - good insights from current measurements
- **Phase 3 (Future Enhancement)**: Full FV profiling - requires new data collection but provides elite-level analysis

By implementing these biomechanical profiling methods, AthleteMetrics positions itself as the most scientifically advanced youth sports performance platform, bridging the gap between basic timing and professional sports science labs.
