/**
 * FX-Mode — Performance-Stufung für Glas/Animations auf HotDoc.
 *
 * Auto-Detection läuft pre-paint in index.html. Diese Lib liefert nur:
 *  - Lese-Helfer für aktuellen Zustand
 *  - User-Override-Setter (gewinnt immer)
 *  - 3-Wege-Cycle für den Footer-Toggle (auto → lite → full → auto)
 */

const KEY = "hotdoc.fxMode";

export type FxMode = "auto" | "lite" | "full";

interface FxState {
  /** Was der User gewählt hat — auto = der Wert wird via Detection geschätzt. */
  override: FxMode;
  /** Was tatsächlich angewendet wird (für UI-Anzeige). */
  effective: "lite" | "full";
}

/**
 * Heuristik wie in index.html — wir replizieren sie hier, damit wir bei
 * Override="auto" zur Runtime denselben Wert berechnen können (z. B.
 * direkt nach setOverride("auto") ohne Reload).
 */
export function detectAutoMode(): "lite" | "full" {
  if (typeof navigator === "undefined") return "full";
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const ua = navigator.userAgent ?? "";
  const lite =
    mem <= 4 ||
    cores <= 4 ||
    /Lenovo TB-X|Android [4-9]\.|MediaTek MT|Helio P22|GoTab|Galaxy Tab A/i.test(ua);
  return lite ? "lite" : "full";
}

export function getOverride(): FxMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "lite" || v === "full") return v;
  } catch {
    // egal
  }
  return "auto";
}

export function getEffective(): "lite" | "full" {
  if (typeof document === "undefined") return "full";
  const ds = document.documentElement.dataset.fx;
  return ds === "lite" ? "lite" : "full";
}

export function getState(): FxState {
  return { override: getOverride(), effective: getEffective() };
}

/**
 * Setzt den Override. Bei "auto" wird die Detection erneut ausgeführt
 * und das Ergebnis als data-fx geschrieben. Bei "lite"/"full" wird der
 * Wert direkt geschrieben + im localStorage gespeichert.
 */
export function setMode(mode: FxMode): "lite" | "full" {
  let effective: "lite" | "full";
  try {
    if (mode === "auto") {
      localStorage.removeItem(KEY);
      effective = detectAutoMode();
    } else {
      localStorage.setItem(KEY, mode);
      effective = mode;
    }
  } catch {
    effective = mode === "lite" ? "lite" : "full";
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.fx = effective;
  }
  return effective;
}

/**
 * Cycle: auto → lite → full → auto.
 * Wird vom Footer-Button verwendet — User sieht die drei Stufen rotieren.
 */
export function cycleMode(): { override: FxMode; effective: "lite" | "full" } {
  const cur = getOverride();
  const next: FxMode = cur === "auto" ? "lite" : cur === "lite" ? "full" : "auto";
  const effective = setMode(next);
  return { override: next, effective };
}

/** Human-readable Label für den Footer-Badge. */
export function labelFor(mode: FxMode, effective: "lite" | "full"): string {
  switch (mode) {
    case "auto":
      return `Auto · ${effective === "lite" ? "Lite" : "Full"}`;
    case "lite":
      return "Lite";
    case "full":
      return "Full";
  }
}
