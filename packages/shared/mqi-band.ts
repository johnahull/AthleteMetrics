/**
 * Movement Quality Index bands (AM-FEAT-019). MQI_TOTAL is the sum of 8 patterns scored 0-3 (0-24).
 * Families see the band word only, never the raw score.
 */
export const MQI_BANDS = [
  { label: "Developing", min: 0, max: 8 },
  { label: "Competent", min: 9, max: 14 },
  { label: "Efficient", min: 15, max: 19 },
  { label: "Advanced", min: 20, max: 24 },
] as const;

export type MqiBandLabel = (typeof MQI_BANDS)[number]["label"];
