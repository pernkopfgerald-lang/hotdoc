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

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
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
      },
      (err) => {
        // PERMISSION_DENIED = 1 · POSITION_UNAVAILABLE = 2 · TIMEOUT = 3
        const status: GeoStatus = err.code === 1 ? "denied" : err.code === 2 ? "unavail" : "stale";
        setState((prev) => ({ ...prev, status, errorMessage: err.message || statusLabel(status) }));
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    // Stale-Detector: alle 5s prüfen ob letzter Fix > STALE_MS her ist
    const staleTimer = setInterval(() => {
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
      navigator.geolocation.clearWatch(watchId);
      clearInterval(staleTimer);
    };
  }, []);

  return state;
}

/**
 * Great-circle-Distanz zwischen zwei Koordinaten in Kilometern.
 * Haversine-Formel, gut genug bis ~0.5% Fehler.
 */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function statusLabel(s: GeoStatus): string {
  switch (s) {
    case "loading": return "GPS sucht …";
    case "live":    return "GPS live";
    case "stale":   return "GPS veraltet";
    case "denied":  return "GPS verweigert";
    case "unavail": return "GPS nicht verfügbar";
  }
}
