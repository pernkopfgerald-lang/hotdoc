/**
 * Offline-Outbox für manuelle Einsatz-Anlagen.
 *
 * Zweck: wenn das Tablet keinen Netz hat und der Funktionaer einen
 * Einsatz / Übung / Lotsendienst anlegt, soll das nicht verloren gehen.
 * Wir parken den POST-Body in der lokalen PouchDB unter
 * `outbox:einsatz:<idempotencyKey>`, und ein 30 s-Cron-Worker im App.tsx
 * versucht jeden Eintrag erneut hochzuladen sobald `navigator.onLine`.
 *
 * Idempotenz: jeder Einsatz hat einen UUID-`idempotencyKey`. Schickt das
 * Tablet denselben POST mehrmals (Wackler / Retry), erkennt das Backend
 * das und gibt den existierenden Einsatz zurueck statt eine Dublette
 * anzulegen.
 *
 * Aufraeumen: erfolgreich gesendete Items werden geloescht. Schlaegt der
 * POST mit 404/409 fehl, wird das Item geloescht damit es nicht endlos
 * retryt. C-05 (Audit 2026-09): 400/422 (Schema-Fehler, meist Drift nach
 * einem Deploy) werden NICHT mehr geloescht, sondern als `blocked`
 * markiert — der Body ist der einzige Traeger der Einsatz-Anlage. Der
 * Flush ueberspringt blockierte Items; unblockEinsaetze() gibt sie nach
 * einem Fix wieder frei.
 */

import { db } from "../db/pouch";
import { apiCall, ApiError } from "./api";

export interface OutboxItem {
  _id: string;
  _rev?: string;
  type: "outbox-einsatz";
  body: Record<string, unknown>;
  enqueuedAt: string;
  lastAttempt?: string;
  attempts: number;
  /** C-05: Schema-Fehler (400/422) → blockiert statt verworfen. */
  blocked?: { status: number; at: string };
}

/** Body in die Outbox legen — idempotencyKey ist Pflicht, damit der Server bei
 *  Retry die existierende Doc erkennt. */
export async function enqueueEinsatz(
  idempotencyKey: string,
  body: Record<string, unknown>,
): Promise<void> {
  const doc: OutboxItem = {
    _id: `outbox:einsatz:${idempotencyKey}`,
    type: "outbox-einsatz",
    body,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };
  try {
    await db.put(doc);
  } catch (err) {
    // Konflikt = schon in der Outbox, ignorieren
    if ((err as { status?: number }).status !== 409) throw err;
  }
}

/** Liefert die noch wartenden Outbox-Eintraege. */
export async function listPending(): Promise<OutboxItem[]> {
  const r = await db.allDocs({
    include_docs: true,
    startkey: "outbox:einsatz:",
    endkey: "outbox:einsatz:￰",
  });
  const items: OutboxItem[] = [];
  for (const row of r.rows) {
    const doc = row.doc as OutboxItem | undefined;
    if (doc && doc.type === "outbox-einsatz") items.push(doc);
  }
  return items;
}

async function removeFromOutbox(item: OutboxItem): Promise<void> {
  try {
    const fresh = (await db.get(item._id)) as OutboxItem;
    await db.remove(fresh._id, fresh._rev!);
  } catch {
    // egal — schon weg
  }
}

async function bumpAttempt(item: OutboxItem): Promise<void> {
  try {
    const fresh = (await db.get(item._id)) as OutboxItem;
    await db.put({
      ...fresh,
      lastAttempt: new Date().toISOString(),
      attempts: (fresh.attempts ?? 0) + 1,
    });
  } catch {
    // egal — naechster Tick versucht erneut
  }
}

/** C-05: Item als blockiert markieren (siehe OutboxItem.blocked). */
async function markBlocked(item: OutboxItem, status: number): Promise<void> {
  try {
    const fresh = (await db.get(item._id)) as OutboxItem;
    await db.put({
      ...fresh,
      lastAttempt: new Date().toISOString(),
      attempts: (fresh.attempts ?? 0) + 1,
      blocked: { status, at: new Date().toISOString() },
    });
  } catch {
    // egal — naechster Tick versucht erneut (und blockiert dann)
  }
}

/** Liefert nur die blockierten Einsatz-Anlagen (Sync-Badge / Diagnose). */
export async function listBlockedEinsaetze(): Promise<OutboxItem[]> {
  return (await listPending()).filter((it) => !!it.blocked);
}

/**
 * Hebt die Blockade aller Einsatz-Anlagen auf — z. B. nach einem App-Update,
 * das den Schema-Fehler behoben hat. Der naechste Flush-Tick versucht sie
 * erneut.
 */
export async function unblockEinsaetze(): Promise<void> {
  for (const item of await listBlockedEinsaetze()) {
    try {
      const fresh = (await db.get(item._id)) as OutboxItem;
      const { blocked: _blocked, ...rest } = fresh;
      await db.put(rest);
    } catch {
      // Race — naechster Tick sieht den Stand.
    }
  }
}

/**
 * Versucht alle wartenden Items hochzuladen. Wird vom 30 s-Cron-Worker
 * sowie sofort beim Online-Werden aufgerufen.
 *
 * Returnt eine kleine Statistik fuer Logging / UI-Badge.
 */
export async function flushOutbox(): Promise<{
  total: number;
  ok: number;
  failed: number;
  pending: number;
}> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const pending = (await listPending()).filter((it) => !it.blocked).length;
    return { total: pending, ok: 0, failed: 0, pending };
  }
  // C-05: blockierte Items ueberspringen — sie warten auf unblockEinsaetze().
  const items = (await listPending()).filter((it) => !it.blocked);
  if (items.length === 0) return { total: 0, ok: 0, failed: 0, pending: 0 };
  let ok = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await apiCall("/api/einsaetze/manuell", {
        method: "POST",
        body: item.body,
      });
      await removeFromOutbox(item);
      ok++;
    } catch (err) {
      // 401 (Token expired) und 423 (Schreibschutz) NICHT löschen — beim
      // naechsten Sync wieder probieren. Bei 401 reload-t der apiCall-Layer
      // ohnehin den User in den Setup-Flow; bei 423 ist das Doc temporaer
      // gesperrt (anderer Tab schreibt gerade), gleich nochmal probieren
      // bringt was. Endgueltig droppen nur bei 404/409 (Ziel weg bzw.
      // Dublette = Ziel erreicht). C-05: 400/422 (Schema-Fehler) blockieren
      // statt droppen — der Body ist der einzige Traeger der Anlage.
      if (err instanceof ApiError && (err.status === 400 || err.status === 422)) {
        console.error(
          `[einsatz-outbox] ${err.status} auf /manuell — Item blockiert statt verworfen:`,
          err.body,
        );
        await markBlocked(item, err.status);
        failed++;
      } else if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        await removeFromOutbox(item);
        failed++;
      } else {
        await bumpAttempt(item);
        failed++;
      }
    }
  }
  const rest = (await listPending()).filter((it) => !it.blocked).length;
  return { total: items.length, ok, failed, pending: rest };
}
