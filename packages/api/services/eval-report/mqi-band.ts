import { MQI_BANDS, type MqiBandLabel } from "@shared/mqi-band";

/** The band word for an event's MQI_TOTAL; null when MQI is absent. Never exposes the raw score. */
export function movementBand(total: number | null | undefined): MqiBandLabel | null {
  if (total === null || total === undefined || Number.isNaN(total) || total < 0) return null;
  return MQI_BANDS.find((band) => total <= band.max)?.label ?? null;
}
