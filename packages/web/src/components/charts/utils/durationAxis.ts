import { durationTickStep, formatMeasurement, type MeasurementFormat } from '@shared/duration-format';

/**
 * Chart.js scale options for a duration (mm:ss) axis: ticks on round steps (5 s to 5 min)
 * labelled as m:ss. Spread into the value scale of a chart whose metric is a duration.
 */
export function durationAxis(format: MeasurementFormat) {
  return {
    afterBuildTicks: (scale: { min: number; max: number; ticks: { value: number }[] }) => {
      if (!Number.isFinite(scale.min) || !Number.isFinite(scale.max)) return;
      const step = durationTickStep(scale.max - scale.min);
      const ticks: { value: number }[] = [];
      for (let v = Math.ceil(scale.min / step) * step; v <= scale.max; v += step) ticks.push({ value: v });
      scale.ticks = ticks;
    },
    ticks: {
      callback: (value: number | string) => formatMeasurement(Number(value), { ...format, decimalPrecision: 0 }),
    },
  };
}
