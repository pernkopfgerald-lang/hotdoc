/**
 * Issue 14 (Einsatz-Test 2026-06-02): useStammdaten-Hook fuer die PWA.
 *
 * Liest `/api/config/stammdaten` beim Boot, cached in localStorage und
 * pollt alle 5 Minuten neu damit Aenderungen im Backoffice (z. B.
 * AS-Stepper auf 1-Minuten-Schritte) automatisch im PWA wirken.
 *
 * Backwards-Compat: Wenn der Endpoint nicht antwortet oder die config noch
 * nicht angelegt ist, faellt der Hook auf die `@hotdoc/shared`-Defaults
 * (AS_STEP=5, AS_MAX=30 etc.). Damit funktioniert das Tablet offline.
 */

import { useEffect, useState } from "react";
import { apiCall } from "./api";

const CACHE_KEY = "hotdoc.stammdaten.v1";
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export interface StammdatenAtemschutz {
  /** Max. Atemschutz-Dauer pro Trupp in Minuten (i.d.R. 30 = eine PA-Flasche). */
  maxDauerMin: number;
  /** Stepper-Schrittweite in Minuten (Default 5). */
  schritteMin: number;
}

export interface Stammdaten {
  atemschutz: StammdatenAtemschutz;
  feuerwehrhausAdresse?: string;
  bezirk?: string;
}

const DEFAULT_STAMMDATEN: Stammdaten = {
  atemschutz: { maxDauerMin: 30, schritteMin: 5 },
};

function readCache(): Stammdaten | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stammdaten;
    if (typeof parsed?.atemschutz?.schritteMin !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(data: Stammdaten): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Quota-Fehler: ignorieren — der naechste Fetch holt es wieder.
  }
}

/**
 * Hook fuer Stammdaten-Lese-Zugriff in Komponenten.
 *
 * @returns Die aktuellen Stammdaten. Sofort: cached Werte (oder Defaults
 *   beim allerersten Boot). Spaeter: vom Backend nachgeladene Werte.
 */
export function useStammdaten(): Stammdaten {
  const [data, setData] = useState<Stammdaten>(() => readCache() ?? DEFAULT_STAMMDATEN);

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const r = await apiCall<{ ok: boolean; data: Partial<Stammdaten> }>(
          "/api/config/stammdaten",
        );
        if (cancelled) return;
        // Defensiv-Merge: nur die Felder uebernehmen die wir kennen.
        const merged: Stammdaten = {
          atemschutz: {
            maxDauerMin:
              typeof r.data?.atemschutz?.maxDauerMin === "number"
                ? r.data.atemschutz.maxDauerMin
                : DEFAULT_STAMMDATEN.atemschutz.maxDauerMin,
            schritteMin:
              typeof r.data?.atemschutz?.schritteMin === "number"
                ? r.data.atemschutz.schritteMin
                : DEFAULT_STAMMDATEN.atemschutz.schritteMin,
          },
          ...(r.data?.feuerwehrhausAdresse
            ? { feuerwehrhausAdresse: r.data.feuerwehrhausAdresse }
            : {}),
          ...(r.data?.bezirk ? { bezirk: r.data.bezirk } : {}),
        };
        setData(merged);
        writeCache(merged);
      } catch {
        // Offline / 404 / 401: stille Failure — Cache + Defaults reichen.
      }
    }
    void fetchOnce();
    const t = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return data;
}
