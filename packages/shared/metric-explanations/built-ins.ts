export type MetricExplanation = {
  title: string;
  shortDescription: string;
  whatItMeasures: string;
  whyItMatters: string;
  unitNote: string;
  directionOfBetter: 'lower' | 'higher' | 'tracking';
};

export const GENERIC_CUSTOM_METRIC_PLACEHOLDER =
  'This is a custom metric tracked by your organization. Ask your coach for more details about what it measures.';

export const BUILT_IN_METRIC_EXPLANATIONS: Record<string, MetricExplanation> = {
  FLY10_TIME: {
    title: '10-Yard Fly',
    shortDescription: 'How fast you cover 10 yards at top speed — a pure max velocity measurement.',
    whatItMeasures:
      'The 10-yard fly measures the time it takes to run 10 yards after you are already up to full speed. When converted from time to speed, it is essentially a maximum velocity measurement.',
    whyItMatters:
      "Max velocity separates fast athletes from the fastest. In game situations you're often already moving — this test captures how fast you actually are once acceleration is out of the picture.",
    unitNote: 'Measured in seconds; lower is better.',
    directionOfBetter: 'lower',
  },
  VERTICAL_JUMP: {
    title: 'Vertical Jump',
    shortDescription: 'How much explosive power your legs generate in a standing jump.',
    whatItMeasures:
      'The vertical jump measures your explosive lower body power by calculating the difference between your standing reach and maximum jump height.',
    whyItMatters:
      'Vertical jump is one of the best indicators of lower body explosiveness and athletic potential. It correlates strongly with sprinting speed, change of direction ability, and overall power output.',
    unitNote: 'Measured in inches; higher is better.',
    directionOfBetter: 'higher',
  },
  AGILITY_505: {
    title: '5-0-5 Agility Test',
    shortDescription: 'How quickly you can stop, turn 180 degrees, and sprint back.',
    whatItMeasures:
      'The 5-0-5 test measures your ability to decelerate, change direction 180 degrees, and re-accelerate. You sprint 5 meters, plant and turn, then sprint back through the timing gates.',
    whyItMatters:
      "This test isolates single-leg change of direction ability, revealing asymmetries between legs. It's essential for sports requiring quick direction changes and reflects injury risk factors.",
    unitNote: 'Measured in seconds; lower is better.',
    directionOfBetter: 'lower',
  },
  AGILITY_5105: {
    title: '5-10-5 Pro Agility',
    shortDescription: 'How fast you can change direction side to side — the NFL Combine standard.',
    whatItMeasures:
      'The Pro Agility (5-10-5) shuttle measures lateral quickness and change of direction. Starting in a three-point stance, you sprint 5 yards, touch, sprint 10 yards, touch, then sprint 5 yards.',
    whyItMatters:
      'This is the standard NFL Combine agility test. It measures lateral movement ability, hip flexibility, and the capacity to rapidly change direction — all critical for field and court sports.',
    unitNote: 'Measured in seconds; lower is better.',
    directionOfBetter: 'lower',
  },
  T_TEST: {
    title: 'T-Test Agility',
    shortDescription: 'How well you move forward, sideways, and backward in one drill.',
    whatItMeasures:
      'The T-Test measures multi-directional agility through a T-shaped course. You sprint forward, shuffle left, shuffle right, shuffle back to center, then backpedal to start.',
    whyItMatters:
      'This comprehensive agility test evaluates forward, lateral, and backward movement in a single drill. It reveals overall movement competency and coordination across all movement planes.',
    unitNote: 'Measured in seconds; lower is better.',
    directionOfBetter: 'lower',
  },
  DASH_40YD: {
    title: '40-Yard Dash',
    shortDescription: 'How fast you accelerate from a standstill over a longer distance.',
    whatItMeasures:
      'The 40-yard dash is the gold standard for measuring linear speed and acceleration. It tests your ability to explode from a standstill and maintain acceleration over a significant distance.',
    whyItMatters:
      'The 40-yard dash is the most recognized speed test in American sports, especially football. It measures both your starting explosiveness and your ability to reach top speed.',
    unitNote: 'Measured in seconds; lower is better.',
    directionOfBetter: 'lower',
  },
  TOP_SPEED: {
    title: 'Top Speed',
    shortDescription: 'Your fastest running pace once fully up to speed.',
    whatItMeasures:
      'Top speed measures your maximum running velocity, typically captured via GPS or radar during a sprint. It represents the fastest speed you can achieve.',
    whyItMatters:
      'Maximum velocity separates good athletes from great ones. While acceleration matters for short distances, top speed becomes crucial for longer sprints and open-field plays.',
    unitNote: 'Measured in mph; higher is better.',
    directionOfBetter: 'higher',
  },
  RSI: {
    title: 'Reactive Strength Index',
    shortDescription: 'How efficiently you bounce off the ground — spring and stiffness in one number.',
    whatItMeasures:
      'RSI measures the ratio of jump height to ground contact time during drop jumps. It indicates how efficiently you can use the stretch-shortening cycle.',
    whyItMatters:
      'RSI reflects your ability to rapidly switch from eccentric to concentric muscle action — crucial for jumping, sprinting, and change of direction. Higher values indicate better reactive ability.',
    unitNote: 'Dimensionless ratio; higher is better.',
    directionOfBetter: 'higher',
  },
};

export const BUILT_IN_METRIC_CODES: ReadonlyArray<string> = Object.keys(BUILT_IN_METRIC_EXPLANATIONS);
