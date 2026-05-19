/**
 * Initial-Seed der lokalen PouchDB.
 * Wird beim App-Start einmal aufgerufen — idempotent (Conflict-Errors ignoriert).
 *
 * Sobald der echte syBOS-Sync läuft, überschreiben die Server-Daten die Seeds.
 */

import { buildDemoPersonen } from "../data/demo-personal";
import { db } from "./pouch";

export async function seedIfEmpty(): Promise<void> {
  const result = await db.allDocs({ startkey: "person:", endkey: "person:￿", limit: 1 });
  if (result.rows.length > 0) return;

  const personen = buildDemoPersonen();
  try {
    await db.bulkDocs(personen);
  } catch (err) {
    // Bei Conflict (z.B. paralleler Tab) einfach ignorieren
    console.warn("[seed] bulkDocs warning", err);
  }
}

/**
 * Lädt alle Personen aus der lokalen DB, sortiert nach Nachname.
 */
export async function getAllPersonen(): Promise<
  Array<{ _id: string; nachname: string; vorname: string; dienstgrad: string; atemschutzGueltig: boolean; aktiv: boolean; syBosId: number }>
> {
  const result = await db.allDocs({
    include_docs: true,
    startkey: "person:",
    endkey: "person:￿",
  });
  return result.rows
    .map((r) => r.doc)
    .filter((d): d is NonNullable<typeof d> => d !== undefined)
    .filter((d) => (d as { aktiv?: boolean }).aktiv !== false)
    .map((d) => d as never)
    .sort((a: { nachname: string }, b: { nachname: string }) => a.nachname.localeCompare(b.nachname));
}
