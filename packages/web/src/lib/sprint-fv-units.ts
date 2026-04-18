export type UnitSystem = 'metric' | 'imperial';

const MS_TO_MPH = 2.23694;
const KG_TO_LBS = 2.20462;
const G = 9.80665; // m/s², standard gravity

// ─── Value Conversions ─────────────────────────────────────────────────────

export function convertVelocity(ms: number, system: UnitSystem): number {
  return system === 'imperial' ? ms * MS_TO_MPH : ms;
}

export function convertMass(kg: number, system: UnitSystem): number {
  return system === 'imperial' ? kg * KG_TO_LBS : kg;
}

/**
 * Convert relative force from N/kg to lbf/lb (×BW).
 * N/kg ÷ g = lbf/lb, representing "times body weight" in horizontal force.
 */
export function convertForceRel(nPerKg: number, system: UnitSystem): number {
  return system === 'imperial' ? nPerKg / G : nPerKg;
}

// ─── Unit Labels ───────────────────────────────────────────────────────────

export function velocityUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'mph' : 'm/s';
}

export function massUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'lbs' : 'kg';
}

export function forceRelUnit(system: UnitSystem): string {
  return system === 'imperial' ? 'lbf/lb' : 'N/kg';
}

export function powerRelUnit(_system: UnitSystem): string {
  return 'W/kg';
}
