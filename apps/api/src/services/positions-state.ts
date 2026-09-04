/**
 * Letzte bekannte Fahrzeug-Positionen: RAM als Fast-Path + CouchDB-Doc
 * `position:<fahrzeugId>` als Persistenz (I-05, Audit R3).
 *
 * Vorher rein In-Memory: nach einem API-Neustart (Deploy, fly-Maschine
 * wandert) waren alle Positionen weg, bis die Tablets wieder pingen — und
 * ein Tablet im Funkloch pingt gerade NICHT. Die Florianstation sah dann
 * "nichts" statt "letzte bekannte Position vor 2 min". Jetzt:
 *  - setPing schreibt synchron in die Map und upsertet fire-and-forget das
 *    Doc `position:<fahrzeugId>` (genau EIN Doc pro Fahrzeug, wird
 *    ueberschrieben — keine Historie, keine Bewegungsspur).
 *  - getAllPings liest die Docs aller Fahrzeuge per _all_docs?keys=... und
 *    merged sie mit dem RAM-State (juengster ts gewinnt); Eintraege aelter
 *    als MAX_PING_AGE_MS fallen raus. Bei CouchDB-Fehler bleibt der RAM-
 *    Stand die Antwort.
 *
 * Datenschutz: Positionen sind PII (Standort des Fahrzeugs = Standort der
 * Mannschaft). Persistiert wird ausschliesslich der jeweils letzte Ping pro
 * Fahrzeug; Koordinaten tauchen nicht in Logs auf (PII-Filter im pino-
 * Logger deckt lat/lng nicht ab — deshalb hier bewusst nie loggen); es wird
 * KEIN Audit-Event geschrieben.
 */

import { FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";

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

/** Shape des persistierten Docs `position:<fahrzeugId>`. */
interface PositionDoc extends FahrzeugPing {
  _id: string;
  _rev?: string;
  type: "position";
}

/** Stale-Cutoff: 5 min ohne Ping -> Fahrzeug faellt aus der Liste. */
export const MAX_PING_AGE_MS = 5 * 60 * 1000;

const state = new Map<FahrzeugId, FahrzeugPing>();

/**
 * Bekannte _rev pro Position-Doc — spart den GET vor jedem Insert (Pings
 * kommen alle 3-5 s pro Fahrzeug). Bei 409 wird der Eintrag verworfen und
 * der naechste Ping holt die _rev frisch.
 */
const revCache = new Map<FahrzeugId, string>();

/** Fehler-Logs der Persistenz drosseln — sonst alle 3 s x 4 Fahrzeuge. */
const PERSIST_WARN_INTERVAL_MS = 60 * 1000;
let lastPersistWarnAt = 0;

/** Zentrale sendet nie Pings — Doc dafuer gar nicht erst abfragen. */
const PING_FAHRZEUG_IDS: ReadonlyArray<FahrzeugId> = FAHRZEUG_IDS.filter(
  (id) => id !== "zentrale",
);

function positionDocId(fahrzeugId: FahrzeugId): string {
  return `position:${fahrzeugId}`;
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function warnThrottled(ctx: Record<string, unknown>, msg: string): void {
  const now = Date.now();
  if (now - lastPersistWarnAt < PERSIST_WARN_INTERVAL_MS) return;
  lastPersistWarnAt = now;
  logger.warn(ctx, msg);
}

function isFahrzeugId(v: unknown): v is FahrzeugId {
  return typeof v === "string" && (FAHRZEUG_IDS as ReadonlyArray<string>).includes(v);
}

/** Defensive Konvertierung Doc -> Ping. null bei kaputtem/fremdem Doc. */
function toPing(d: Partial<PositionDoc>): FahrzeugPing | null {
  if (d.type !== "position") return null;
  if (!isFahrzeugId(d.fahrzeugId)) return null;
  if (typeof d.lat !== "number" || typeof d.lng !== "number") return null;
  if (typeof d.ts !== "string" || Number.isNaN(new Date(d.ts).getTime())) return null;
  return {
    fahrzeugId: d.fahrzeugId,
    lat: d.lat,
    lng: d.lng,
    ts: d.ts,
    ...(typeof d.speed === "number" ? { speed: d.speed } : {}),
    ...(typeof d.heading === "number" ? { heading: d.heading } : {}),
    ...(typeof d.accuracyM === "number" ? { accuracyM: d.accuracyM } : {}),
  };
}

/**
 * Upsert des Docs `position:<fahrzeugId>`: (get ->) rev -> insert.
 * 409 wird ignoriert (fremde Revision, z. B. zweite API-Instanz oder ein
 * noch laufender Vorgaenger-Insert) — der naechste Ping in 3-5 s holt die
 * _rev frisch. Andere Fehler wirft die Funktion, setPing loggt sie.
 */
async function persistPing(ping: FahrzeugPing): Promise<void> {
  const id = positionDocId(ping.fahrzeugId);
  let rev = revCache.get(ping.fahrzeugId);
  if (!rev) {
    try {
      const existing = (await db.get(id)) as { _rev?: string };
      rev = existing._rev;
    } catch (err) {
      if (statusCode(err) !== 404) throw err;
    }
  }
  const doc: PositionDoc = {
    ...ping,
    _id: id,
    ...(rev ? { _rev: rev } : {}),
    type: "position",
  };
  try {
    const r = (await db.insert(doc)) as { rev?: string };
    if (r.rev) revCache.set(ping.fahrzeugId, r.rev);
  } catch (err) {
    if (statusCode(err) === 409) {
      revCache.delete(ping.fahrzeugId);
      return;
    }
    throw err;
  }
}

/**
 * RAM-Update (synchron) + Persistenz fire-and-forget. Der POST-Handler
 * wartet nicht auf CouchDB — Tablet-Pings muessen billig bleiben.
 */
export function setPing(ping: FahrzeugPing): void {
  state.set(ping.fahrzeugId, ping);
  void persistPing(ping).catch((err) => {
    warnThrottled(
      { fahrzeugId: ping.fahrzeugId, err: errMsg(err) },
      "Fahrzeug-Position konnte nicht persistiert werden",
    );
  });
}

/**
 * Liefert die letzten bekannten Pings aller Fahrzeuge: persistierte Docs
 * und RAM gemerged (juengster ts gewinnt), aelter als MAX_PING_AGE_MS
 * aussortiert. Neuere Couch-Staende wandern in den RAM, damit dieser nach
 * einem Neustart wieder warm ist.
 */
export async function getAllPings(): Promise<FahrzeugPing[]> {
  try {
    const res = await db.fetch({ keys: PING_FAHRZEUG_IDS.map(positionDocId) });
    for (const row of res.rows) {
      if (!("doc" in row) || !row.doc) continue;
      const d = row.doc as Partial<PositionDoc>;
      const ping = toPing(d);
      if (!ping) continue;
      const ram = state.get(ping.fahrzeugId);
      if (!ram || new Date(ram.ts).getTime() < new Date(ping.ts).getTime()) {
        state.set(ping.fahrzeugId, ping);
      }
      // _rev-Cache warm halten (spart den GET beim naechsten Persist). Nur
      // setzen wenn leer — ein laufender Insert dieser Instanz hat sonst
      // bereits die neuere _rev eingetragen.
      if (typeof d._rev === "string" && !revCache.has(ping.fahrzeugId)) {
        revCache.set(ping.fahrzeugId, d._rev);
      }
    }
  } catch (err) {
    warnThrottled(
      { err: errMsg(err) },
      "Persistierte Fahrzeug-Positionen nicht lesbar — antworte aus dem RAM",
    );
  }
  evictOlderThan(MAX_PING_AGE_MS);
  return [...state.values()];
}

/**
 * Raeumt Pings aelter als `maxAgeMs` aus dem RAM-State. Wird von getAllPings
 * und dem periodischen Timer aufgerufen, damit die Liste nie veraltete
 * Fahrzeuge anzeigt. Die Docs in CouchDB bleiben bestehen (ein Doc pro
 * Fahrzeug, kein Wachstum) und werden beim Lesen ueber ts gefiltert.
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

let evictionTimer: ReturnType<typeof setInterval> | null = null;

if (typeof setInterval === "function") {
  evictionTimer = setInterval(
    () => evictOlderThan(MAX_PING_AGE_MS),
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
