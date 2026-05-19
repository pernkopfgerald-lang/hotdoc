import PouchDB from "pouchdb-browser";
import type { FahrzeugConfigDoc } from "@hotdoc/shared";

/**
 * Lokale PouchDB-Instanz. Eine pro Tablet.
 * Sync zum CouchDB-Backend kommt in Phase 1.2 (Continuous-Replication).
 */

export const db = new PouchDB("hotdoc-local", {
  auto_compaction: true,
});

/** PouchDB-Variante des FahrzeugConfigDoc — _rev ist nach erstem Speichern immer da. */
export type FahrzeugConfigStored = FahrzeugConfigDoc & { _rev: string };

/**
 * Holt das Fahrzeug-Config-Dokument (oder null wenn Tablet noch nicht konfiguriert).
 */
export async function getFahrzeugConfig(): Promise<FahrzeugConfigStored | null> {
  try {
    return (await db.get("fahrzeug:self")) as FahrzeugConfigStored;
  } catch (err) {
    if ((err as PouchDB.Core.Error).status === 404) return null;
    throw err;
  }
}
