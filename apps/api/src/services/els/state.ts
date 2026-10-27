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

export function getElsSnapshot(): ElsSnapshot | null {
  return snapshot;
}

export async function setElsUnits(units: ElsUnit[]): Promise<void> {
  const override = await ladeZuordnung();
  const status = baueFahrzeugStatus(units, override);
  const nichtZugeordnet = units.filter((u) => ordneUnitZu(u, override) === null);
  snapshot = { fetchedAt: new Date().toISOString(), units, status, nichtZugeordnet };
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

/** Alter der Einheiten-Daten in Sekunden (null = noch keine). */
export function snapshotAlterSec(): number | null {
  return snapshot ? Math.round((Date.now() - Date.parse(snapshot.fetchedAt)) / 1000) : null;
}
