/**
 * I-08 (Audit 2026-09): React.lazy mit Reload-Fallback bei Chunk-Fehlern.
 *
 * Problem: Nach einem Deploy liegen unter den alten Chunk-Hashes keine
 * Dateien mehr. Ein Tablet mit gecachter App-Shell, das erst JETZT den
 * Setup- oder Popout-Chunk nachlädt, bekommt 404 → "Failed to fetch
 * dynamically imported module" → ErrorBoundary-Recovery-Screen mitten im
 * Einsatz. Ein einziger Reload holt die frische Shell und behebt das.
 *
 * Verhalten:
 *  - Import schlägt fehl → sessionStorage-Flag "hotdoc.chunkReload" setzen
 *    und einmal location.reload().
 *  - Flag schon gesetzt (Reload hat nicht geholfen, z. B. echtes Offline) →
 *    Fehler durchreichen, die ErrorBoundary übernimmt.
 *  - Erfolgreicher Import räumt das Flag weg, damit der nächste Deploy
 *    wieder einen Reload-Versuch bekommt.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_FLAG = "hotdoc.chunkReload";

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
}

function writeFlag(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(RELOAD_FLAG, "1");
    else sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // egal — Private-Mode; dann gibt es eben keinen zweiten Versuch
  }
}

export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      writeFlag(false);
      return mod;
    } catch (err) {
      if (readFlag()) {
        // Zweiter Fehlschlag in dieser Session → nicht endlos reloaden.
        writeFlag(false);
        throw err;
      }
      console.warn("[lazy-retry] Chunk-Import fehlgeschlagen, lade neu:", err);
      writeFlag(true);
      window.location.reload();
      // Promise nie auflösen — der Reload ersetzt die Seite ohnehin.
      return await new Promise<{ default: T }>(() => {
        /* wartet auf Reload */
      });
    }
  });
}
