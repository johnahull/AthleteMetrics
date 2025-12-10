/**
 * Metric Education Utilities
 * Week 3: Metric Education & Context
 *
 * Provides educational content and contextual information about athletic performance metrics
 */

// ============================================================================
// Types
// ============================================================================

export interface MetricEducation {
  name: string;
  description: string;
  whyItMatters: string;
  howToImprove: string[];
  sportRelevance: string[];
  unit: string;
  lowerIsBetter: boolean;
}

export interface PercentileResult {
  percentile: number;
  label: string;
}

export type BenchmarkLevel =
  | 'elite'
  | 'college'
  | 'above_average'
  | 'average'
  | 'developing';

export interface BenchmarkResult {
  level: BenchmarkLevel;
  description: string;
}

export interface PRComparison {
  percentDiff: number;
  text: string;
  isPersonalBest: boolean;
  isNewPersonalBest: boolean;
}

export interface RecentComparison {
  percentDiff: number;
  trend: 'improving' | 'steady' | 'declining';
  text: string;
}

export interface AthleteMetricData {
  personalBest: number;
  recentAverage: number;
  measurementCount: number;
  lastMeasurement: number;
}

export interface MetricContext {
  comparisonToPR: PRComparison | null;
  comparisonToRecent: RecentComparison | null;
  percentile: PercentileResult | null;
  benchmark: BenchmarkResult | null;
}

// ============================================================================
// Metric Education Data
// ============================================================================

const METRIC_EDUCATION: Record<string, MetricEducation> = {
  FLY10_TIME: {
    name: '10-Yard Fly',
    description:
      'The 10-yard fly measures your maximum velocity acceleration capacity. It captures how quickly you can reach and maintain top speed over a short distance.',
    whyItMatters:
      'This metric is crucial for sports requiring explosive speed bursts. It reflects your ability to accelerate after an initial buildup phase, simulating game situations where you\'re already in motion.',
    howToImprove: [
      'Practice flying sprints with a 10-20 yard buildup zone',
      'Focus on hip drive and arm mechanics at top speed',
      'Strengthen hip flexors and glutes with explosive exercises',
      'Include resisted sprints with sleds or bands',
      'Work on stride frequency drills',
    ],
    sportRelevance: [
      'Football',
      'Soccer',
      'Baseball',
      'Track & Field',
      'Basketball',
      'Lacrosse',
    ],
    unit: 'seconds',
    lowerIsBetter: true,
  },
  VERTICAL_JUMP: {
    name: 'Vertical Jump',
    description:
      'The vertical jump measures your explosive lower body power by calculating the difference between your standing reach and maximum jump height.',
    whyItMatters:
      'Vertical jump is one of the best indicators of lower body explosiveness and athletic potential. It correlates strongly with sprinting speed, change of direction ability, and overall power output.',
    howToImprove: [
      'Perform plyometric exercises (box jumps, depth jumps)',
      'Strengthen legs with squats, deadlifts, and lunges',
      'Practice countermovement technique for efficient energy transfer',
      'Include Olympic lifts (power cleans, snatches) for explosive power',
      'Improve ankle stiffness with calf raises and jump rope',
    ],
    sportRelevance: [
      'Basketball',
      'Volleyball',
      'Football',
      'Track & Field',
      'Soccer',
      'Tennis',
    ],
    unit: 'inches',
    lowerIsBetter: false,
  },
  AGILITY_505: {
    name: '5-0-5 Agility Test',
    description:
      'The 5-0-5 test measures your ability to decelerate, change direction 180 degrees, and re-accelerate. You sprint 5 meters, plant and turn, then sprint back through the timing gates.',
    whyItMatters:
      'This test isolates single-leg change of direction ability, revealing asymmetries between legs. It\'s essential for sports requiring quick direction changes and reflects injury risk factors.',
    howToImprove: [
      'Practice deceleration drills with emphasis on body positioning',
      'Strengthen single-leg stability with Bulgarian split squats',
      'Work on plant foot mechanics and push-off technique',
      'Include lateral bounding and cutting drills',
      'Develop hip and ankle mobility for deeper cuts',
    ],
    sportRelevance: [
      'Soccer',
      'Basketball',
      'Tennis',
      'Football',
      'Lacrosse',
      'Field Hockey',
    ],
    unit: 'seconds',
    lowerIsBetter: true,
  },
  AGILITY_5105: {
    name: '5-10-5 Pro Agility',
    description:
      'The Pro Agility (5-10-5) shuttle measures lateral quickness and change of direction. Starting in a three-point stance, you sprint 5 yards, touch, sprint 10 yards, touch, then sprint 5 yards.',
    whyItMatters:
      'This is the standard NFL Combine agility test. It measures lateral movement ability, hip flexibility, and the capacity to rapidly change direction—all critical for field and court sports.',
    howToImprove: [
      'Practice the specific movement pattern repeatedly',
      'Focus on low hip position during direction changes',
      'Strengthen lateral movement with side shuffles and carioca',
      'Improve hip mobility with dynamic stretching',
      'Work on explosive first steps in each direction',
    ],
    sportRelevance: [
      'Football',
      'Basketball',
      'Soccer',
      'Baseball',
      'Softball',
      'Lacrosse',
    ],
    unit: 'seconds',
    lowerIsBetter: true,
  },
  T_TEST: {
    name: 'T-Test Agility',
    description:
      'The T-Test measures multi-directional agility through a T-shaped course. You sprint forward, shuffle left, shuffle right, shuffle back to center, then backpedal to start.',
    whyItMatters:
      'This comprehensive agility test evaluates forward, lateral, and backward movement in a single drill. It reveals overall movement competency and coordination across all movement planes.',
    howToImprove: [
      'Practice each movement segment individually first',
      'Focus on staying low throughout the entire drill',
      'Strengthen hip abductors and adductors for lateral power',
      'Work on backpedal technique and transition mechanics',
      'Include cone drills with various patterns',
    ],
    sportRelevance: [
      'Basketball',
      'Tennis',
      'Soccer',
      'Volleyball',
      'Football',
      'Handball',
    ],
    unit: 'seconds',
    lowerIsBetter: true,
  },
  DASH_40YD: {
    name: '40-Yard Dash',
    description:
      'The 40-yard dash is the gold standard for measuring linear speed and acceleration. It tests your ability to explode from a standstill and maintain acceleration over a significant distance.',
    whyItMatters:
      'The 40-yard dash is the most recognized speed test in American sports, especially football. It measures both your starting explosiveness and your ability to reach top speed.',
    howToImprove: [
      'Perfect your three-point stance and first step mechanics',
      'Practice drive phase technique (first 10 yards)',
      'Develop transition phase into upright sprinting',
      'Strengthen posterior chain (glutes, hamstrings)',
      'Include block starts and resisted acceleration drills',
    ],
    sportRelevance: [
      'Football',
      'Track & Field',
      'Baseball',
      'Soccer',
      'Rugby',
      'Lacrosse',
    ],
    unit: 'seconds',
    lowerIsBetter: true,
  },
  TOP_SPEED: {
    name: 'Top Speed',
    description:
      'Top speed measures your maximum running velocity, typically captured via GPS or radar during a sprint. It represents the fastest speed you can achieve.',
    whyItMatters:
      'Maximum velocity separates good athletes from great ones. While acceleration matters for short distances, top speed becomes crucial for longer sprints and open-field plays.',
    howToImprove: [
      'Include flying sprints (30-60 meters) in training',
      'Focus on relaxed, efficient mechanics at high speed',
      'Strengthen hip flexors for faster leg turnover',
      'Practice overspeed training (slight downhill, assisted sprints)',
      'Develop elastic strength through plyometrics',
    ],
    sportRelevance: [
      'Track & Field',
      'Soccer',
      'Football',
      'Rugby',
      'Baseball',
      'Field Hockey',
    ],
    unit: 'mph',
    lowerIsBetter: false,
  },
  RSI: {
    name: 'Reactive Strength Index',
    description:
      'RSI measures the ratio of jump height to ground contact time during drop jumps. It indicates how efficiently you can use the stretch-shortening cycle.',
    whyItMatters:
      'RSI reflects your ability to rapidly switch from eccentric to concentric muscle action—crucial for jumping, sprinting, and change of direction. Higher values indicate better reactive ability.',
    howToImprove: [
      'Practice depth jumps with focus on minimal ground contact',
      'Include ankle stiffness drills (pogo jumps)',
      'Strengthen through plyometric progressions',
      'Work on landing mechanics and immediate takeoff',
      'Develop tendon stiffness with isometric exercises',
    ],
    sportRelevance: [
      'Basketball',
      'Volleyball',
      'Track & Field',
      'Gymnastics',
      'Soccer',
      'Tennis',
    ],
    unit: '',
    lowerIsBetter: false,
  },
};

// ============================================================================
// Benchmark Data (approximate values for general population)
// ============================================================================

interface BenchmarkThresholds {
  elite: number;
  college: number;
  aboveAverage: number;
  average: number;
  // Below average is anything worse than average
}

// Male benchmarks (default)
const BENCHMARKS_MALE: Record<string, BenchmarkThresholds> = {
  FLY10_TIME: { elite: 1.0, college: 1.1, aboveAverage: 1.15, average: 1.25 },
  VERTICAL_JUMP: { elite: 36, college: 30, aboveAverage: 26, average: 22 },
  AGILITY_505: { elite: 2.1, college: 2.3, aboveAverage: 2.45, average: 2.6 },
  AGILITY_5105: { elite: 4.2, college: 4.5, aboveAverage: 4.7, average: 5.0 },
  T_TEST: { elite: 9.0, college: 10.0, aboveAverage: 10.5, average: 11.5 },
  DASH_40YD: { elite: 4.4, college: 4.7, aboveAverage: 4.9, average: 5.2 },
  TOP_SPEED: { elite: 23, college: 21, aboveAverage: 19, average: 17 },
  RSI: { elite: 2.5, college: 2.0, aboveAverage: 1.6, average: 1.2 },
};

// Female benchmarks (adjusted)
const BENCHMARKS_FEMALE: Record<string, BenchmarkThresholds> = {
  FLY10_TIME: { elite: 1.15, college: 1.25, aboveAverage: 1.35, average: 1.45 },
  VERTICAL_JUMP: { elite: 28, college: 22, aboveAverage: 18, average: 14 },
  AGILITY_505: { elite: 2.3, college: 2.5, aboveAverage: 2.65, average: 2.85 },
  AGILITY_5105: { elite: 4.6, college: 4.9, aboveAverage: 5.1, average: 5.4 },
  T_TEST: { elite: 10.0, college: 11.0, aboveAverage: 11.8, average: 12.5 },
  DASH_40YD: { elite: 4.9, college: 5.2, aboveAverage: 5.5, average: 5.9 },
  TOP_SPEED: { elite: 20, college: 18, aboveAverage: 16, average: 14 },
  RSI: { elite: 2.2, college: 1.7, aboveAverage: 1.4, average: 1.0 },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get educational content for a metric
 */
export function getMetricEducation(metric: string): MetricEducation | null {
  return METRIC_EDUCATION[metric] || null;
}

/**
 * Check if lower values are better for a metric
 */
export function isLowerBetterMetric(metric: string): boolean {
  const education = METRIC_EDUCATION[metric];
  return education?.lowerIsBetter ?? false;
}

/**
 * Format a metric value with appropriate units and precision
 */
export function formatMetricValue(value: number, metric: string): string {
  const education = METRIC_EDUCATION[metric];
  if (!education) return value.toString();

  switch (metric) {
    case 'FLY10_TIME':
    case 'AGILITY_505':
    case 'AGILITY_5105':
    case 'T_TEST':
    case 'DASH_40YD':
      return `${value.toFixed(2)}s`;
    case 'VERTICAL_JUMP':
      return `${value.toFixed(1)}"`;
    case 'TOP_SPEED':
      return `${value.toFixed(1)} mph`;
    case 'RSI':
      return value.toFixed(2);
    default:
      return value.toString();
  }
}

/**
 * Get percentile ranking for a metric value
 */
export function getPercentileRanking(
  value: number,
  metric: string,
  ageGroup?: string,
  gender?: 'male' | 'female'
): PercentileResult | null {
  const benchmarks =
    gender === 'female' ? BENCHMARKS_FEMALE[metric] : BENCHMARKS_MALE[metric];
  if (!benchmarks) return null;

  const lowerIsBetter = isLowerBetterMetric(metric);

  // Calculate approximate percentile based on benchmarks
  let percentile: number;

  if (lowerIsBetter) {
    // For time-based metrics: lower value = higher percentile
    if (value <= benchmarks.elite) {
      percentile = 95 + ((benchmarks.elite - value) / benchmarks.elite) * 5;
    } else if (value <= benchmarks.college) {
      percentile =
        80 +
        ((benchmarks.college - value) / (benchmarks.college - benchmarks.elite)) *
          15;
    } else if (value <= benchmarks.aboveAverage) {
      percentile =
        60 +
        ((benchmarks.aboveAverage - value) /
          (benchmarks.aboveAverage - benchmarks.college)) *
          20;
    } else if (value <= benchmarks.average) {
      percentile =
        40 +
        ((benchmarks.average - value) /
          (benchmarks.average - benchmarks.aboveAverage)) *
          20;
    } else {
      // Below average
      percentile = Math.max(5, 40 - ((value - benchmarks.average) / benchmarks.average) * 35);
    }
  } else {
    // For height/speed metrics: higher value = higher percentile
    if (value >= benchmarks.elite) {
      percentile = 95 + Math.min(5, ((value - benchmarks.elite) / benchmarks.elite) * 5);
    } else if (value >= benchmarks.college) {
      percentile =
        80 +
        ((value - benchmarks.college) / (benchmarks.elite - benchmarks.college)) *
          15;
    } else if (value >= benchmarks.aboveAverage) {
      percentile =
        60 +
        ((value - benchmarks.aboveAverage) /
          (benchmarks.college - benchmarks.aboveAverage)) *
          20;
    } else if (value >= benchmarks.average) {
      percentile =
        40 +
        ((value - benchmarks.average) /
          (benchmarks.aboveAverage - benchmarks.average)) *
          20;
    } else {
      // Below average
      percentile = Math.max(5, 40 - ((benchmarks.average - value) / benchmarks.average) * 35);
    }
  }

  // Clamp percentile to valid range
  percentile = Math.max(1, Math.min(99, percentile));

  // Generate label based on percentile
  let label: string;
  if (percentile >= 95) {
    label = 'Elite - Top 5%';
  } else if (percentile >= 90) {
    label = 'Exceptional - Top 10%';
  } else if (percentile >= 80) {
    label = 'Excellent - Top 20%';
  } else if (percentile >= 60) {
    label = 'Above Average';
  } else if (percentile >= 40) {
    label = 'Average';
  } else if (percentile >= 20) {
    label = 'Below Average';
  } else {
    label = 'Developing';
  }

  return {
    percentile: Math.round(percentile),
    label,
  };
}

/**
 * Get benchmark comparison for a metric value
 */
export function getBenchmarkComparison(
  value: number,
  metric: string,
  gender?: 'male' | 'female'
): BenchmarkResult | null {
  const benchmarks =
    gender === 'female' ? BENCHMARKS_FEMALE[metric] : BENCHMARKS_MALE[metric];
  if (!benchmarks) return null;

  const lowerIsBetter = isLowerBetterMetric(metric);
  let level: BenchmarkLevel;
  let description: string;

  const isBetter = (val: number, threshold: number) =>
    lowerIsBetter ? val <= threshold : val >= threshold;

  if (isBetter(value, benchmarks.elite)) {
    level = 'elite';
    description =
      'Elite level performance. You\'re among the top performers, comparable to professional and Olympic athletes.';
  } else if (isBetter(value, benchmarks.college)) {
    level = 'college';
    description =
      'College-level performance. This level is competitive for collegiate athletics and high-level competition.';
  } else if (isBetter(value, benchmarks.aboveAverage)) {
    level = 'above_average';
    description =
      'Above average performance. You\'re performing better than most athletes at your level.';
  } else if (isBetter(value, benchmarks.average)) {
    level = 'average';
    description =
      'Average performance for trained athletes. There\'s good potential for improvement with focused training.';
  } else {
    level = 'developing';
    description =
      'Developing performance level. Focus on fundamentals and consistent training to improve this metric.';
  }

  return { level, description };
}

/**
 * Get comprehensive context for a metric value
 */
export function getMetricContext(
  value: number,
  metric: string,
  athleteData: AthleteMetricData | null,
  gender?: 'male' | 'female'
): MetricContext | null {
  // Validate metric exists
  if (!METRIC_EDUCATION[metric]) return null;

  const lowerIsBetter = isLowerBetterMetric(metric);

  // Calculate PR comparison
  let comparisonToPR: PRComparison | null = null;
  if (athleteData) {
    const prDiff = value - athleteData.personalBest;
    const percentDiff = (prDiff / athleteData.personalBest) * 100;
    const isPersonalBest = value === athleteData.personalBest;

    // For lower-is-better, new PR is when value < personalBest
    // For higher-is-better, new PR is when value > personalBest
    const isNewPersonalBest = lowerIsBetter
      ? value < athleteData.personalBest
      : value > athleteData.personalBest;

    let text: string;
    if (isNewPersonalBest) {
      text = `New Personal Best! ${Math.abs(percentDiff).toFixed(1)}% improvement`;
    } else if (isPersonalBest) {
      text = 'Matches your Personal Best!';
    } else {
      const direction = lowerIsBetter
        ? prDiff > 0
          ? 'slower than'
          : 'faster than'
        : prDiff > 0
          ? 'above'
          : 'below';
      text = `${Math.abs(percentDiff).toFixed(1)}% ${direction} your PR`;
    }

    comparisonToPR = {
      percentDiff,
      text,
      isPersonalBest,
      isNewPersonalBest,
    };
  }

  // Calculate recent comparison
  let comparisonToRecent: RecentComparison | null = null;
  if (athleteData && athleteData.measurementCount > 1) {
    const recentDiff = value - athleteData.recentAverage;
    const percentDiff = (recentDiff / athleteData.recentAverage) * 100;

    // Determine trend based on whether improvement direction matches metric type
    let trend: 'improving' | 'steady' | 'declining';
    const improvementThreshold = 2; // 2% threshold for "steady"

    if (Math.abs(percentDiff) < improvementThreshold) {
      trend = 'steady';
    } else if (lowerIsBetter) {
      trend = recentDiff < 0 ? 'improving' : 'declining';
    } else {
      trend = recentDiff > 0 ? 'improving' : 'declining';
    }

    const trendText =
      trend === 'improving'
        ? 'above'
        : trend === 'declining'
          ? 'below'
          : 'in line with';

    comparisonToRecent = {
      percentDiff,
      trend,
      text: `${Math.abs(percentDiff).toFixed(1)}% ${trendText} your recent average`,
    };
  }

  return {
    comparisonToPR,
    comparisonToRecent,
    percentile: getPercentileRanking(value, metric, undefined, gender),
    benchmark: getBenchmarkComparison(value, metric, gender),
  };
}
