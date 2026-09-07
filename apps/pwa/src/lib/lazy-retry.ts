/**
 * I-08 (Audit 2026-09): React.lazy mit Reload-Fallback bei Chunk-Fehlern.
 *
 * Problem: Nach einem Deploy liegen unter den alten Chunk-Hashes keine
 * Dateien mehr. Ein Tablet mit gecachter App-Shell, das erst JETZT den
 * Setup- oder Popout-Chunk nachlädt, bekommt 404 → "Failed to fetch
 * dynamically imported module" → ErrorBoundary-Recovery-Screen mitten im
 * Einsatz. Ein Reload holt die frische Shell und behebt das — meistens.
 *
 * Review 2026-09-06: EIN automatischer Reload reichte nicht immer. Der
 * Service Worker laeuft mit registerType "autoUpdate" und precacht auch
 * index.html; nach einem Deploy braucht die Aktivierung der neuen SW-
 * Version manchmal einen ERSTEN Reload nur zum Umschalten, der zweite
 * bekommt dann wirklich die frischen Chunk-Hashes. Bisher gab genau der
 * erste, noch stale Reload-Versuch schon auf und zeigte die Fehlerseite —
 * ein Klick auf "Neu laden" war in Wahrheit der (funktionierende) zweite
 * Versuch. Jetzt: bis zu 2 automatische Reloads, erst danach die
 * ErrorBoundary.
 *
 * Verhalten:
 *  - Import schlägt fehl, Zaehler < MAX_AUTO_RELOADS → Zaehler in
 *    sessionStorage hochzaehlen und location.reload().
 *  - Zaehler erreicht (Reloads haben nicht geholfen, z. B. echtes Offline)
 *    → Fehler durchreichen, die ErrorBoundary übernimmt.
 *  - Erfolgreicher Import räumt den Zaehler weg, damit der nächste Deploy
 *    wieder frische Reload-Versuche bekommt.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_COUNT_KEY = "hotdoc.chunkReload";
const MAX_AUTO_RELOADS = 2;

function readCount(): number {
  try {
    return Number.parseInt(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(n: number): void {
  try {
    if (n <= 0) sessionStorage.removeItem(RELOAD_COUNT_KEY);
    else sessionStorage.setItem(RELOAD_COUNT_KEY, String(n));
  } catch {
    // egal — Private-Mode; dann gibt es eben keinen automatischen Retry
  }
}

// Signatur spiegelt React.lazy: `ComponentType<any>`, damit Komponenten mit
// konkreten Props (Setup: onSetupDone) ohne Cast durchgehen — mit `unknown`
// wären deren Props nicht zuweisbar.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      writeCount(0);
      return mod;
    } catch (err) {
      const count = readCount();
      if (count >= MAX_AUTO_RELOADS) {
        // Reloads haben nicht geholfen → nicht endlos weiterversuchen.
        writeCount(0);
        throw err;
      }
      console.warn(
        `[lazy-retry] Chunk-Import fehlgeschlagen, lade neu (Versuch ${count + 1}/${MAX_AUTO_RELOADS}):`,
        err,
      );
      writeCount(count + 1);
      window.location.reload();
      // Promise nie auflösen — der Reload ersetzt die Seite ohnehin.
      return await new Promise<{ default: T }>(() => {
        /* wartet auf Reload */
      });
    }
  });
}
