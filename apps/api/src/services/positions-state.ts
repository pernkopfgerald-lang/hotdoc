/**
 * In-Memory-State der letzten bekannten Fahrzeug-Positionen.
 *
 * Pro Fahrzeug genau ein Eintrag — der letzte Ping. Kein Persistieren in
 * CouchDB: bei API-Restart sind die Positionen weg, aber die Fahrzeuge
 * pingen alle 3-5 s ohnehin neu, also ist die Lücke spätestens nach 5 s
 * geschlossen.
 *
 * Sicherheitsaspekt: Positionen sind PII (Personen-bezogene Daten —
 * Standort des Fahrzeugs = Standort der Mannschaft). Wir halten sie nur
 * fluechtig im RAM, schreiben sie nicht in Logs (PII-Filter im pino-Logger
 * deckt body.lat/.lng nicht standardmäßig ab → Hinweis im writeAuditEvent-
 * Pfad: position-Updates KEIN Audit-Event).
 */

import type { FahrzeugId } from "@hotdoc/shared";

export interface FahrzeugPing {
  fahrzeugId: FahrzeugId;
  lat: number;
  lng: number;
  /** Geschwindigkeit in m/s wenn vom Browser geliefert. */
  speed?: number;
  /** Fahrtrichtung in Grad (0=Nord) wenn verfuegbar. */
  heading?: number;
  /** Genauigkeit in Metern (vom Geolocation-API). */
  accuracyM?: number;
  /** Server-Eingangs-Zeit (nicht Tablet-Zeit, damit ein Tablet mit falsch
   *  gestellter Uhr nicht alle Positionen veraltet aussehen laesst). */
  ts: string;
}

const state = new Map<FahrzeugId, FahrzeugPing>();

export function setPing(ping: FahrzeugPing): void {
  state.set(ping.fahrzeugId, ping);
}

export function getAllPings(): FahrzeugPing[] {
  return [...state.values()];
}

/**
 * Räumt Pings älter als `maxAgeMs` aus dem State. Wird vom GET-Handler
 * aufgerufen damit die Liste nie veraltete Fahrzeuge anzeigt.
 */
export function evictOlderThan(maxAgeMs: number): void {
  const now = Date.now();
  for (const [id, ping] of state.entries()) {
    const age = now - new Date(ping.ts).getTime();
    if (age > maxAgeMs) state.delete(id);
  }
}

// — Periodische Eviction —
// Verhindert dass die Map waechst falls keine GETs reinkommen (z.B. wenn
// nur Fahrzeug-Tablets pingen und niemand die Liste pollt). 5-min-Tick
// ist konservativ und billig.
const PERIODIC_EVICTION_MS = 5 * 60 * 1000;
const PERIODIC_STALE_AFTER_MS = 5 * 60 * 1000;

let evictionTimer: ReturnType<typeof setInterval> | null = null;

if (typeof setInterval === "function") {
  evictionTimer = setInterval(
    () => evictOlderThan(PERIODIC_STALE_AFTER_MS),
    PERIODIC_EVICTION_MS,
  );
  // Node-spezifisch: unref damit der Timer den Prozess nicht am Leben hält.
  if (evictionTimer && typeof (evictionTimer as { unref?: () => void }).unref === "function") {
    (evictionTimer as { unref: () => void }).unref();
  }
}

/**
 * Stoppt die periodische Eviction. Nuetzlich fuer SIGTERM-Handler und Tests.
 */
export function stopEviction(): void {
  if (evictionTimer) {
    clearInterval(evictionTimer);
    evictionTimer = null;
  }
}
