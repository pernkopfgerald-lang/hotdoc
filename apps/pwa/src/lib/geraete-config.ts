/**
 * BUG-Fix: Geräte-Liste pro Fahrzeug aus der LIVE-Backoffice-Konfig laden.
 *
 * Vorher zog die Fahrzeugbericht-Seite die fest verdrahtete Liste aus
 * `data/gear.ts` — dadurch zeigten Fahrzeugbericht und Backoffice
 * unterschiedliche Geräte (der Funktionär pflegt im Backoffice unter
 * „Geräte & Mittel pro Fahrzeug" die echte Ausstattung, z. B. 24 Items für
 * LFA-B, die PWA zeigte aber nur die ~10 hartkodierten Defaults).
 *
 * Dieser Hook liest `/api/config/geraete` (genau das Doc, das das Backoffice
 * schreibt: `{ byFahrzeug: { lfa-b: [{id,bezeichnung,isOelbindemittel?}], … } }`),
 * cached pro Fahrzeug in localStorage und pollt alle 5 Minuten. Offline /
 * 404 / 401 → Fallback auf die hartkodierten Defaults aus `data/gear.ts`,
 * damit das Tablet auch ohne Netz eine sinnvolle Liste hat.
 */

import { useEffect, useState } from "react";
import type { FahrzeugId } from "@hotdoc/shared";
import { apiCall } from "./api";
import { GEAR_BY_FAHRZEUG } from "../data/gear";
import type { GearItem } from "../components/GearChips";

const CACHE_KEY = "hotdoc.geraete.v1";
const POLL_INTERVAL_MS = 5 * 60 * 1000;

type ByFahrzeug = Partial<Record<string, GearItem[]>>;

/** Roh-Items aus der Config defensiv auf die GearItem-Form bringen. */
function sanitizeItems(raw: unknown): GearItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: GearItem[] = [];
  for (const it of raw) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as { id?: unknown }).id === "string" &&
      typeof (it as { bezeichnung?: unknown }).bezeichnung === "string"
    ) {
      const r = it as { id: string; bezeichnung: string; isOelbindemittel?: unknown };
      const item: GearItem = { id: r.id, bezeichnung: r.bezeichnung };
      if (r.isOelbindemittel === true) item.isOelbindemittel = true;
      out.push(item);
    }
  }
  return out;
}

function readCache(): ByFahrzeug | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ByFahrzeug;
  } catch {
    return null;
  }
}

function writeCache(data: ByFahrzeug): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Quota / Private-Mode → der nächste Fetch holt es erneut.
  }
}

/**
 * Liefert die Geräte-Liste für ein Fahrzeug. Sofort: Cache oder hartkodierter
 * Default. Danach: die im Backoffice gepflegte Live-Liste.
 */
export function useGeraete(fahrzeugId: FahrzeugId): GearItem[] {
  const fallback = GEAR_BY_FAHRZEUG[fahrzeugId] ?? [];
  const [items, setItems] = useState<GearItem[]>(() => {
    const cached = readCache()?.[fahrzeugId];
    return cached && cached.length > 0 ? cached : fallback;
  });

  useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const r = await apiCall<{ ok: boolean; data: { byFahrzeug?: Record<string, unknown> } }>(
          "/api/config/geraete",
        );
        if (cancelled) return;
        const all = r.data?.byFahrzeug ?? {};
        const cleanedMap: ByFahrzeug = {};
        for (const [fid, v] of Object.entries(all)) {
          const cleaned = sanitizeItems(v);
          if (cleaned) cleanedMap[fid] = cleaned;
        }
        writeCache(cleanedMap);
        const mine = cleanedMap[fahrzeugId];
        if (mine && mine.length > 0) setItems(mine);
      } catch {
        // Offline / 404 / 401: Cache + Fallback reichen.
      }
    }
    void fetchOnce();
    const t = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [fahrzeugId]);

  return items;
}
