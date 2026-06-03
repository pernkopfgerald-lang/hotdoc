/**
 * Geolocation-Hook: kapselt `navigator.geolocation.watchPosition` und
 * exponiert die letzte bekannte Position + einen Status für die UI.
 *
 * Fallback (kein GPS, Permission verweigert, kein navigator) → null und
 * die aufrufende Page kann eine Demo-Position einblenden.
 */
import { useEffect, useRef, useState } from "react";

export type GeoStatus =
  | "loading"   // initial · noch keine Antwort
  | "live"      // Position kommt regelmäßig
  | "denied"    // Permission verweigert
  | "unavail"   // Gerät hat keine Geolocation (Desktop ohne GPS o.ä.)
  | "stale";    // Letzte Position älter als STALE_MS

export interface GeoFix {
  lat: number;
  lng: number;
  accuracyM: number;          // Genauigkeit in Metern (gemäß Navigator)
  speedKmh: number | null;    // null wenn nicht verfügbar
  headingDeg: number | null;
  /** Unix-ms Zeitstempel der Position */
  ts: number;
}

export interface GeoState {
  fix: GeoFix | null;
  status: GeoStatus;
  /** Sekunden seit letztem Fix (für UI-Anzeige) */
  ageSec: number;
  /** Letzte Fehlermeldung (zur Diagnose) */
  errorMessage: string | null;
}

const STALE_MS = 30_000;

const INITIAL: GeoState = {
  fix: null,
  status: "loading",
  ageSec: 0,
  errorMessage: null,
};

/**
 * High-Accuracy Geolocation Tracking.
 * - watchPosition statt Polling → batterie-schonend, Browser regelt Rate
 * - maximumAge 5s → keine uralten Cache-Werte
 * - timeout 20s → erste Antwort darf länger dauern (kalter GPS-Start)
 */
export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>(INITIAL);
  const fixRef = useRef<GeoFix | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ ...INITIAL, status: "unavail" });
      return;
    }

    const onPos = (pos: GeolocationPosition): void => {
      const fix: GeoFix = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        speedKmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
        headingDeg: pos.coords.heading ?? null,
        ts: pos.timestamp,
      };
      fixRef.current = fix;
      setState({ fix, status: "live", ageSec: 0, errorMessage: null });
    };
    const onErr = (err: GeolocationPositionError): void => {
      // PERMISSION_DENIED = 1 · POSITION_UNAVAILABLE = 2 · TIMEOUT = 3
      const status: GeoStatus = err.code === 1 ? "denied" : err.code === 2 ? "unavail" : "stale";
      setState((prev) => ({ ...prev, status, errorMessage: err.message || statusLabel(status) }));
    };

    // Akku-Gate (Audit 2026-06-03, KISS&SEXY R-1): High-Accuracy-GPS ist
    // der grösste Standby-Stromfresser. Im Hintergrund/Standby
    // (document.hidden) stoppen wir den Watch und starten ihn beim
    // Wieder-Sichtbar neu — der Browser liefert dann sofort einen frischen
    // Fix (maximumAge 5s). Während des aktiven Einsatzes (Screen an) bleibt
    // das Tracking exakt wie bisher.
    let watchId: number | null = null;
    const startWatch = (): void => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      });
    };
    const stopWatch = (): void => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };
    const onVisChange = (): void => {
      if (document.hidden) stopWatch();
      else startWatch();
    };

    if (!document.hidden) startWatch();
    document.addEventListener("visibilitychange", onVisChange);

    // Stale-Detector: alle 5s prüfen ob letzter Fix > STALE_MS her ist
    const staleTimer = setInterval(() => {
      if (document.hidden) return; // im Standby keine UI-Updates nötig
      const f = fixRef.current;
      if (!f) return;
      const age = Date.now() - f.ts;
      setState((prev) => ({
        ...prev,
        ageSec: Math.floor(age / 1000),
        status: age > STALE_MS && prev.status === "live" ? "stale" : prev.status,
      }));
    }, 5_000);

    return () => {
      stopWatch();
      document.removeEventListener("visibilitychange", onVisChange);
      clearInterval(staleTimer);
    };
  }, []);

  return state;
}

// OPT-1 (Audit 2026-06-03): haversineKm war 3× dupliziert (hier, in
// MapCard.tsx und in @hotdoc/shared/florian.ts). Konsolidiert auf die
// shared-Implementierung — die ist robuster (Math.min(1, sqrt)-Clamp gegen
// NaN). Re-Export hier hält bestehende Importe `from "../lib/geo"` stabil.
export { haversineKm } from "@hotdoc/shared";

export function statusLabel(s: GeoStatus): string {
  switch (s) {
    case "loading": return "GPS sucht …";
    case "live":    return "GPS live";
    case "stale":   return "GPS veraltet";
    case "denied":  return "GPS verweigert";
    case "unavail": return "GPS nicht verfügbar";
  }
}
