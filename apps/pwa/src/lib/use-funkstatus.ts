import { useEffect, useState } from "react";
import type { FahrzeugId } from "@hotdoc/shared";
import { apiCall } from "./api";
import { istEinsatzFahrzeugId } from "./fahrzeuge";
import { pollingPaused } from "./visibility";

export interface FunkstatusEintrag {
  /** Rohwert des Funkstatus ("2"); leer, wenn die Leitstelle keinen Status meldet. */
  status: string;
  /** Zeitpunkt der letzten Statusaenderung (ISO), falls bekannt. */
  since: string | null;
}

export type FunkstatusMap = Partial<Record<FahrzeugId, FunkstatusEintrag>>;

export interface FunkstatusStand {
  map: FunkstatusMap;
  /** ELS ist serverseitig eingerichtet. */
  enabled: boolean;
  /** Daten fehlen oder sind veraltet (Poller laeuft nicht / ELS nicht erreichbar). */
  stale: boolean;
  /** Mindestens eine Antwort ist da. */
  geladen: boolean;
}

const LEER: FunkstatusStand = { map: {}, enabled: false, stale: true, geladen: false };


/**
 * Funkstatus aller Fahrzeuge aus /api/els/status. Das Backend fragt ELS hoechstens
 * alle 60 s ab — hier alle 15 s abholen. Ein Fehler laesst den letzten Stand stehen.
 */
export function useFunkstatus(): FunkstatusStand {
  const [stand, setStand] = useState<FunkstatusStand>(LEER);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await apiCall<{
          enabled: boolean;
          stale: boolean;
          items: Array<{ fahrzeugId: string; status: string; since: string | null }>;
        }>("/api/els/status");
        if (cancelled) return;
        const map: FunkstatusMap = {};
        for (const i of r.items) {
          if (istEinsatzFahrzeugId(i.fahrzeugId)) {
            map[i.fahrzeugId] = { status: i.status ?? "", since: i.since };
          }
        }
        setStand({ map, enabled: r.enabled, stale: r.stale, geladen: true });
      } catch {
        // Netz weg / 401: letzter Stand bleibt, naechster Tick versucht es erneut
      }
    };
    void tick();
    const t = setInterval(() => {
      if (pollingPaused()) return;
      void tick();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return stand;
}
