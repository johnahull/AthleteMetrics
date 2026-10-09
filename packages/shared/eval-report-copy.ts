/**
 * Family-facing Fresh & Healthy wording shared by the eval PDF (api) and the web report view,
 * so the two surfaces cannot drift apart (AM-FEAT-019).
 */
export const LOAD_LABELS = {
  light: "Light week",
  medium: "Medium week",
  heavy: "Heavy week",
} as const;

export const BALANCE_LABELS = {
  balanced: "Balanced",
  keep_an_eye: "Keep an eye on it",
  worth_working_on: "Worth working on",
  neutral: "Left-right balance",
} as const;

export const LEFT_RIGHT_SUFFIX = "left vs right";

/** Neutral balance shows the raw left vs right percentage; other statuses show their label. */
export function balanceText(balance: { status: string; label: string; lsiPercent: number }): string {
  return balance.status === "neutral"
    ? `${Math.round(balance.lsiPercent * 10) / 10}% ${LEFT_RIGHT_SUFFIX}`
    : balance.label;
}

/** A metric value with its unit. Seconds always show two decimals so 1.90 and 1.85 line up; other units are trimmed to at most two. */
export function formatValue(value: number, unit: string): string {
  const text = unit === "s" ? value.toFixed(2) : String(Math.round(value * 100) / 100);
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}
