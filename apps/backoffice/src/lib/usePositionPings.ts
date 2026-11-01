import { useCallback, useState } from "react";
import { apiCall } from "../api/client";
import { FAHRZEUG_IDS } from "./fahrzeuge";
import { useSichtbarPolling } from "./useSichtbarPolling";

export interface PositionPing {
  fahrzeugId: string;
  lat: number;
  lng: number;
  /** ISO-Zeitpunkt der Position (bei ELS-Funkposition der Abrufzeitpunkt). */
  ts: string;
}

/**
 * Live-Positionen der Einsatzfahrzeuge fuer die Karte (GET /api/positions; die
 * Funkposition aus ELS hat dort Vorrang vor dem Tablet-GPS). Aktualisiert alle 5 s,
 * pausiert bei verstecktem Tab. Der State wird nur bei echter Aenderung ersetzt,
 * damit die Seite nicht bei jedem Abruf neu gezeichnet wird.
 *
 * Frueher bekam die Backoffice-Karte nur die Florianstation uebergeben, obwohl ein
 * Kommentar behauptete, die Fahrzeuge kaemen "live" dazu — es gab keinen Abruf.
 */
export function usePositionPings(): PositionPing[] {
  const [pings, setPings] = useState<PositionPing[]>([]);

  const tick = useCallback(async () => {
    try {
      const r = await apiCall<{ items?: PositionPing[] }>("/api/positions");
      const next = (r.items ?? []).filter((p) => (FAHRZEUG_IDS as ReadonlyArray<string>).includes(p.fahrzeugId));
      setPings((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    } catch {
      // Netz weg / Sitzung abgelaufen (das meldet der API-Client): letzter Stand bleibt stehen.
    }
  }, []);

  useSichtbarPolling(tick, 5_000);
  return pings;
}
