/**
 * Mango-Index-Definitionen (zentral). Eigenes Modul OHNE DB-/Config-Import,
 * damit Worker/Routes die Namen fuer `use_index` nutzen koennen, ohne dass
 * Tests `couch/client.js` mit mehr als `db` mocken muessen.
 *
 * Regel (CouchDB Mango): ein Index ist nur nutzbar, wenn der Selektor ALLE
 * Indexfelder einschraenkt. Ohne passenden Index liest CouchDB die komplette
 * DB (`_all_docs`) — inkl. der grossen Foto-Dokumente.
 */

export interface MangoIndexDef {
  name: string;
  ddoc: string;
  fields: string[];
}

function def(name: string, fields: string[]): MangoIndexDef {
  return { name, ddoc: `idx-${name}`, fields };
}

export const MANGO_INDIZES = {
  /** GET /api/einsaetze?status=aktiv, Auto-Close (aktive), Doppelalarm-Pruefung. */
  typeStatus: def("type-status", ["type", "status"]),
  /** GET /api/fahrzeugberichte/meine (mit Status-Filter). */
  typeFahrzeugIdStatus: def("type-fahrzeugId-status", ["type", "fahrzeugId", "status"]),
  /** GET /api/fahrzeugberichte/meine?status=alle (nur Praefix). */
  typeFahrzeugId: def("type-fahrzeugId", ["type", "fahrzeugId"]),
  /** ELS-Poller: Einsaetze im Abgleichfenster. */
  typeAlarmierungZeit: def("type-alarmierungZeit", ["type", "alarmierungZeit"]),
  /** Auto-Close Orphan-Sweep: abgeschlossene Einsaetze im 7-Tage-Fenster. */
  typeStatusEinsatzende: def("type-status-einsatzende", ["type", "status", "einsatzende"]),
  /** Auto-Close Gnadenfrist-Sweep: abgeschlossene Einsaetze mit Marker. */
  typeStatusHauptabschlussAm: def("type-status-hauptabschlussAm", [
    "type",
    "status",
    "hauptabschlussAm",
  ]),
  /** Login: Benutzer per Username. */
  typeUsername: def("type-username", ["type", "username"]),
} as const satisfies Record<string, MangoIndexDef>;

/**
 * `use_index`-Wert fuer db.find. Advisory: existiert der Index (noch) nicht,
 * faellt CouchDB auf die normale Planung zurueck — die Query liefert dann
 * weiterhin korrekte Ergebnisse, nur langsamer.
 */
export function useIndex(idx: MangoIndexDef): [string, string] {
  return [idx.ddoc, idx.name];
}
