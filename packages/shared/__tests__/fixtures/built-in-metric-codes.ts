/**
 * Every built-in site metric code, taken from the site_metrics seeds in migrations/ (0022, 0107, 0123, 0125, 0128,
 * 0131, 0135, 0136, 0144, 0145, 0146, 0150, 0152, 0156, 0158, 0159, 0161, 0169, 0174-0176) at authoring time.
 * Checked in on purpose: the CI database has no seeded metrics, so a database test would pass vacuously.
 * Add a code here when a migration seeds a new built-in metric; the coverage test then asks for its meaning.
 */
export const BUILT_IN_METRIC_CODE_LIST: string[] = [
  // Body measurements
  'WEIGHT_LBS', 'HEIGHT_IN', 'STANDING_REACH', 'WINGSPAN',
  // Sprints and fly times
  'DASH_5YD', 'DASH_10YD', 'DASH_20YD', 'DASH_30YD', 'DASH_40YD',
  'DASH_10M', 'DASH_20M', 'DASH_30M', 'DASH_40M',
  'FLY10_TIME', 'FLY10M_TIME', 'FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30',
  'TOP_SPEED', 'TOP_SPEED_MPH',
  // Agility
  'AGILITY_5105', 'AGILITY_5105_L', 'AGILITY_5105_R',
  'AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI',
  'AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI',
  'AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_M_INTERP', 'AGILITY_COD_DEFICIT_YD',
  'T_TEST',
  // Jumps and power
  'VERTICAL_JUMP', 'JUMP_CMJ_HOH', 'JUMP_SJ_HEIGHT', 'POWER_EUR', 'JUMP_BROAD',
  'JUMP_CMJ_SL_L', 'JUMP_CMJ_SL_R', 'PEAK_POWER_W', 'PEAK_POWER_REL', 'MOMENTUM',
  'APPROACH_REACH', 'APPROACH_JUMP', 'BLOCK_REACH', 'BLOCK_JUMP',
  // Reactive strength and hops
  'RSI', 'RSI_105', 'RSI_105_HEIGHT', 'RSI_105_GCT',
  'RSI_L', 'RSI_R', 'RSI_SINGLE_LEFT', 'RSI_SINGLE_RIGHT', 'RSI_ASYM',
  'HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R', 'HOP_SL_TRIPLE_LSI',
  'HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R', 'HOP_SL_TRIPLE_BL_LSI',
  // Strength
  'BENCH_1RM', 'SQUAT_1RM', 'DEADLIFT_1RM', 'OHP_1RM',
  'BENCH_1RM_KG', 'SQUAT_1RM_KG', 'DEADLIFT_1RM_KG', 'OHP_1RM_KG',
  'PULLUPS_MAX', 'PUSHUPS_MAX',
  // Conditioning
  'COND_YYIR1_DISTANCE', 'COND_VO2MAX_EST',
  // Movement quality
  'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
  'MQI_TOTAL', 'MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE', 'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR', 'MQ_TRANSITION_TOTAL',
];
