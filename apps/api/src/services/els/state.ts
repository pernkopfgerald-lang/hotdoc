/**
 * In-Memory-Stand der ELS-Anbindung: letzte Einheiten (Funkstatus + Position),
 * Poll-Zustand fuer die Health-Anzeige, Zuordnung ELS-Einheit -> Fahrzeug.
 * Nur RAM: nach einem Neustart fuellt der erste Poll (<= 60 s) alles neu.
 */

import type { FahrzeugId } from "@hotdoc/shared";
import { db } from "../../couch/client.js";
import { baueFahrzeugStatus, ordneUnitZu, type ElsUnit, type ElsZuordnungOverride, type FahrzeugFunkstatus } from "./logik.js";

export interface ElsPollStand {
  unitsLastAt: string | null;
  unitsLastOkAt: string | null;
  unitsLastError: string | null;
  eventsLastAt: string | null;
  eventsLastOkAt: string | null;
  eventsLastError: string | null;
  eventsOffen: number;
  /** Seit Prozessstart aus ELS selbst angelegte Einsaetze. */
  angelegt: number;
  /** Seit Prozessstart mit einem vorhandenen Einsatz verknuepfte ELS-Einsaetze. */
  verknuepft: number;
}

const poll: ElsPollStand = {
  unitsLastAt: null,
  unitsLastOkAt: null,
  unitsLastError: null,
  eventsLastAt: null,
  eventsLastOkAt: null,
  eventsLastError: null,
  eventsOffen: 0,
  angelegt: 0,
  verknuepft: 0,
};

export function getElsPollStand(): Readonly<ElsPollStand> {
  return poll;
}

export function recordUnitsPoll(error: string | null): void {
  const now = new Date().toISOString();
  poll.unitsLastAt = now;
  poll.unitsLastError = error;
  if (error === null) poll.unitsLastOkAt = now;
}

export function recordEventsPoll(offen: number, error: string | null): void {
  const now = new Date().toISOString();
  poll.eventsLastAt = now;
  poll.eventsLastError = error;
  if (error === null) {
    poll.eventsLastOkAt = now;
    poll.eventsOffen = offen;
  }
}

export function zaehleAngelegt(): void {
  poll.angelegt += 1;
}

export function zaehleVerknuepft(): void {
  poll.verknuepft += 1;
}

// ─── Einheiten-Snapshot ──────────────────────────────────────────────

export interface ElsSnapshot {
  fetchedAt: string;
  units: ElsUnit[];
  status: FahrzeugFunkstatus[];
  /** Einheiten, die keinem unserer Fahrzeuge zugeordnet werden konnten. */
  nichtZugeordnet: ElsUnit[];
}

let snapshot: ElsSnapshot | null = null;

/** Nur der lokal (von dieser Instanz) abgerufene Stand. Fuer Anzeige/Routen `holeSnapshot` nutzen. */
export function getElsSnapshot(): ElsSnapshot | null {
  return snapshot;
}

export async function setElsUnits(units: ElsUnit[]): Promise<void> {
  const override = await ladeZuordnung();
  const status = baueFahrzeugStatus(units, override);
  const nichtZugeordnet = units.filter((u) => ordneUnitZu(u, override) === null);
  snapshot = { fetchedAt: new Date().toISOString(), units, status, nichtZugeordnet };
  await speichereSnapshot(snapshot);
}

// ─── Gemeinsamer Stand (alle Instanzen) ──────────────────────────────

const SNAPSHOT_DOC = "state:els-snapshot";
const SNAPSHOT_CACHE_MS = 4000;
let geteilt: { at: number; value: ElsSnapshot | null } | null = null;
let snapshotRev: string | undefined;

/** Der abfragende Server legt den Stand ab, damit alle Instanzen ihn lesen koennen (ein Doc, wird ueberschrieben). */
async function speichereSnapshot(s: ElsSnapshot): Promise<void> {
  try {
    const r = await db.insert({
      _id: SNAPSHOT_DOC,
      ...(snapshotRev ? { _rev: snapshotRev } : {}),
      type: "state",
      snapshot: s,
    });
    snapshotRev = r.rev;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409) {
      snapshotRev = undefined; // naechster Versuch holt die _rev frisch
      try {
        const d = (await db.get(SNAPSHOT_DOC)) as { _rev?: string };
        snapshotRev = d._rev;
        const r = await db.insert({ _id: SNAPSHOT_DOC, _rev: snapshotRev, type: "state", snapshot: s });
        snapshotRev = r.rev;
      } catch {
        snapshotRev = undefined;
      }
    }
    // Andere Fehler: lokaler Stand bleibt gueltig, Anzeige faellt auf RAM zurueck.
  }
}

/**
 * Neuester bekannter Stand: lokal abgerufen oder von einer anderen Instanz
 * gespeichert (4 s zwischengespeichert). Wirft nie.
 */
export async function holeSnapshot(): Promise<ElsSnapshot | null> {
  if (!geteilt || Date.now() - geteilt.at > SNAPSHOT_CACHE_MS) {
    let value: ElsSnapshot | null = geteilt?.value ?? null;
    try {
      const d = (await db.get(SNAPSHOT_DOC)) as { snapshot?: ElsSnapshot };
      value = d.snapshot ?? null;
    } catch {
      // nicht lesbar/noch nicht vorhanden → vorhandenen Wert behalten
    }
    geteilt = { at: Date.now(), value };
  }
  const fremd = geteilt.value;
  if (snapshot && (!fremd || Date.parse(snapshot.fetchedAt) >= Date.parse(fremd.fetchedAt))) return snapshot;
  return fremd ?? snapshot;
}

// ─── Manuelle Zuordnung (config:els-zuordnung) ───────────────────────

const ZUORDNUNG_DOC = "config:els-zuordnung";
const ZUORDNUNG_CACHE_MS = 60_000;
let zuordnungCache: { at: number; value: ElsZuordnungOverride } | null = null;

/** Liest { fahrzeuge: { "<fahrzeugId>": "<unid oder callname>" } } aus der Konfiguration. */
export async function ladeZuordnung(): Promise<ElsZuordnungOverride> {
  if (zuordnungCache && Date.now() - zuordnungCache.at < ZUORDNUNG_CACHE_MS) return zuordnungCache.value;
  let value: ElsZuordnungOverride = {};
  try {
    const doc = (await db.get(ZUORDNUNG_DOC)) as { data?: { fahrzeuge?: Record<string, unknown> } };
    const f = doc.data?.fahrzeuge ?? {};
    for (const id of ["kdo", "tlf-a-4000", "lfa-b", "mtf"] as FahrzeugId[]) {
      const v = f[id];
      if (typeof v === "string" && v.trim()) value[id] = v.trim();
    }
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) {
      // Config nicht lesbar -> mit dem letzten bekannten Stand weiterarbeiten.
      return zuordnungCache?.value ?? {};
    }
    value = {};
  }
  zuordnungCache = { at: Date.now(), value };
  return value;
}

/** Nach einer Aenderung der Zuordnung sofort neu auswerten. */
export function verwerfeZuordnungCache(): void {
  zuordnungCache = null;
}

/** Alter eines Stands in Sekunden (null = kein Stand). */
export function snapshotAlterSec(s: ElsSnapshot | null): number | null {
  return s ? Math.round((Date.now() - Date.parse(s.fetchedAt)) / 1000) : null;
}
