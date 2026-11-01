import { useCallback, useState } from "react";
import { florianstationBesetzt } from "@hotdoc/shared";
import { apiCall } from "../api/client";
import { useSichtbarPolling } from "./useSichtbarPolling";

/**
 * Ist die Florianstation laut Leitstelle (ELS) besetzt? true = besetzt, false = unbesetzt,
 * null = unbekannt (ELS aus, keine/veraltete Daten). Aktualisiert alle 15 s, pausiert bei
 * verstecktem Tab. Steuert die Farbe des Florianstation-Markers (besetzt = gruen).
 */
export function useFlorianBesetzt(): boolean | null {
  const [besetzt, setBesetzt] = useState<boolean | null>(null);

  const tick = useCallback(async () => {
    try {
      const r = await apiCall<{
        stale: boolean;
        items: Array<{ fahrzeugId: string; status: string }>;
      }>("/api/els/status");
      const flo = r.items.find((i) => i.fahrzeugId === "zentrale");
      setBesetzt(r.stale || !flo ? null : florianstationBesetzt(flo.status));
    } catch {
      // Netz weg / Sitzung abgelaufen (meldet der API-Client): letzter Stand bleibt stehen.
    }
  }, []);

  useSichtbarPolling(tick, 15_000);
  return besetzt;
}
