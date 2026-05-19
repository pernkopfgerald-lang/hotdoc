/**
 * Atemschutz-Erfassung pro Mannschaftsplatz.
 * Siehe Spec FR-2 (Detail) und Anhang A.3.
 */

export const AS_MIN = 5 as const;
export const AS_MAX = 30 as const; // max. eine PA-Flasche
export const AS_STEP = 5 as const;
export const AS_DEFAULT = 15 as const;

/**
 * Clampt einen AS-Dauer-Wert ins erlaubte Intervall [AS_MIN, AS_MAX].
 */
export function clampAsDauer(value: number): number {
  if (Number.isNaN(value)) return AS_DEFAULT;
  return Math.max(AS_MIN, Math.min(AS_MAX, Math.round(value / AS_STEP) * AS_STEP));
}
