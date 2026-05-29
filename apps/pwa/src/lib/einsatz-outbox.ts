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
 * POST mit 4xx-Schema-Fehler fehl (also ein bug, nicht netz), wird das
 * Item ebenfalls geloescht damit es nicht endlos retryt.
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
    const pending = (await listPending()).length;
    return { total: pending, ok: 0, failed: 0, pending };
  }
  const items = await listPending();
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
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // Schema-Fehler / Auth-Problem → endlos retry hilft nicht, weg damit.
        await removeFromOutbox(item);
        failed++;
      } else {
        await bumpAttempt(item);
        failed++;
      }
    }
  }
  const rest = (await listPending()).length;
  return { total: items.length, ok, failed, pending: rest };
}
