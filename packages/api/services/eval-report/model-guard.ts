import type { EvalReportModel } from "./model";

/**
 * Compile-time guard: no property name anywhere in EvalReportModel's type graph may contain a pre-test
 * survey word (sleep, soreness, stress, energy, cycle) or a wellness synonym. Adding such a field makes
 * this file fail `tsc`. Type-only; nothing imports it at runtime.
 */
type KeysOf<T> = T extends readonly (infer U)[]
  ? KeysOf<U>
  : T extends object
    ? { [K in keyof T & string]: K | KeysOf<T[K]> }[keyof T & string]
    : never;

type WellnessWord = "sleep" | "soreness" | "stress" | "energy" | "cycle" | "wellness" | "mood" | "readiness" | "pain";

type WellnessKeys = Extract<Lowercase<KeysOf<EvalReportModel>>, `${string}${WellnessWord}${string}`>;

export const noWellnessFields: [WellnessKeys] extends [never] ? true : never = true;
