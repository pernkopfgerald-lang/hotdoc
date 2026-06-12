/**
 * BLOCKER-2b+3 (Audit 2026-06-03): Generische Offline-Outbox für beliebige
 * schreibende API-Requests (PUT/POST).
 *
 * Motivation: Der Fahrzeugbericht-Abschluss-Upload und der Solo-Einsatz-
 * Abschluss waren bisher fire-and-forget — schlug der Request im Funkloch
 * fehl, war der fertige Bericht weg (nur der lokale Draft aus report-state
 * blieb, aber der erreichte das Backend nie). Diese Outbox parkt den Request
 * in der lokalen PouchDB und der 30-s-Worker in App.tsx reicht ihn nach,
 * sobald wieder Netz da ist — analog zur bereits bewährten einsatz-outbox.ts.
 *
 * Reihenfolge-Garantie: Der `_id` trägt eine 1-stellige Priorität direkt nach
 * dem Prefix (`outbox:req:<prio>:<dedupeKey>`). PouchDB-allDocs liefert
 * lexikografisch sortiert → niedrigere Priorität wird zuerst geflusht. Das ist
 * essenziell: der Fahrzeugbericht-PUT (Prio 1) MUSS vor dem Einsatz-Abschluss-
 * POST (Prio 2) laufen, sonst greift der schreibschutz_aktiv-Check (423) und
 * der fzgber-PUT würde abgelehnt.
 *
 * Dedup: Gleicher dedupeKey → der Eintrag wird überschrieben (jüngster Stand
 * gewinnt). Mehrere Offline-Edits desselben Berichts erzeugen also nur EINEN
 * Outbox-Eintrag mit dem letzten Stand. Der Ziel-Endpoint ist idempotent
 * (PUT überschreibt denselben Doc, doppelter /abschluss → 409 "already_closed").
 */

import { db } from "../db/pouch";
import { apiCall, ApiError } from "./api";

export interface RequestOutboxItem {
  _id: string;
  _rev?: string;
  type: "outbox-request";
  method: "POST" | "PUT";
  path: string;
  body: Record<string, unknown>;
  enqueuedAt: string;
  lastAttempt?: string;
  attempts: number;
  /**
   * AUDIT-03 (Audit 2026-06-12): Item ist blockiert statt im Endlos-Retry.
   * Gesetzt bei 423 (Schreibschutz — Bericht wurde zwischenzeitlich
   * abgeschlossen) und bei 409 auf einem fahrzeugbericht-PUT (Doppel-
   * Konflikt). Der Flush ÜBERSPRINGT blockierte Items; erst eine
   * Reaktivierung des Einsatzes ruft unblockRequests() und reicht sie nach.
   * Vorher: 423 retry'te alle 30 s gegen dieselbe Wand, 409 DROPPTE den
   * einzigen Träger des finalen Berichts.
   */
  blocked?: { status: number; at: string };
}

/**
 * Legt einen Request in die Outbox (oder überschreibt einen bestehenden mit
 * gleichem dedupeKey).
 *
 * @param priority 1 = zuerst flushen (z. B. Daten-PUT), 2 = danach (z. B.
 *   Abschluss-POST). Einstellig halten (lexikografische Sortierung).
 * @param dedupeKey eindeutig pro logischer Aktion, z. B.
 *   `fzgber:<einsatzId>:<fahrzeugId>` oder `abschluss:<einsatzId>`.
 */
export async function enqueueRequest(
  priority: number,
  dedupeKey: string,
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const _id = `outbox:req:${priority}:${dedupeKey}`;
  // get-then-put, damit ein bestehender Eintrag mit frischem Body überschrieben
  // wird (jüngster Stand). Bei 409-Race einmal nachziehen.
  for (let attempt = 0; attempt < 2; attempt++) {
    let rev: string | undefined;
    try {
      rev = ((await db.get(_id)) as RequestOutboxItem)._rev;
    } catch {
      // 404 → existiert noch nicht, normaler Erstanlage-Fall
    }
    try {
      await db.put({
        _id,
        ...(rev ? { _rev: rev } : {}),
        type: "outbox-request" as const,
        method,
        path,
        body,
        enqueuedAt: new Date().toISOString(),
        attempts: 0,
      });
      return;
    } catch (err) {
      if ((err as { status?: number }).status === 409 && attempt === 0) continue;
      throw err;
    }
  }
}

/** Liefert die wartenden Requests, lexikografisch nach _id sortiert
 *  (= Prioritäts-Reihenfolge). */
export async function listPendingRequests(): Promise<RequestOutboxItem[]> {
  const r = await db.allDocs({
    include_docs: true,
    startkey: "outbox:req:",
    endkey: "outbox:req:￰",
  });
  const items: RequestOutboxItem[] = [];
  for (const row of r.rows) {
    const doc = row.doc as RequestOutboxItem | undefined;
    if (doc && doc.type === "outbox-request") items.push(doc);
  }
  return items;
}

/** Liefert nur die blockierten Items (für Sync-Badge / Diagnose). */
export async function listBlockedRequests(): Promise<RequestOutboxItem[]> {
  return (await listPendingRequests()).filter((it) => !!it.blocked);
}

/**
 * Hebt die Blockade aller Items dieses Einsatzes auf — wird nach einer
 * Reaktivierung gerufen, damit der nächste Flush-Tick die gepufferten
 * Berichte/Abschlüsse automatisch nachreicht. Matching über den Pfad:
 * jeder Outbox-Pfad enthält die URL-enkodierte Einsatz-ID.
 */
export async function unblockRequests(einsatzId: string): Promise<void> {
  const enc = encodeURIComponent(einsatzId);
  const items = await listBlockedRequests();
  for (const item of items) {
    if (!item.path.includes(enc)) continue;
    try {
      const fresh = (await db.get(item._id)) as RequestOutboxItem;
      const { blocked: _blocked, ...rest } = fresh;
      await db.put(rest);
    } catch {
      // Race (schon weg / parallel geändert) — nächster Tick sieht den Stand.
    }
  }
}

/** Markiert ein Item als blockiert (siehe RequestOutboxItem.blocked). */
async function markBlocked(item: RequestOutboxItem, status: number): Promise<void> {
  try {
    const fresh = (await db.get(item._id)) as RequestOutboxItem;
    await db.put({
      ...fresh,
      lastAttempt: new Date().toISOString(),
      attempts: (fresh.attempts ?? 0) + 1,
      blocked: { status, at: new Date().toISOString() },
    });
  } catch {
    // egal — nächster Tick versucht erneut (und blockiert dann)
  }
}

async function removeItem(item: RequestOutboxItem): Promise<void> {
  try {
    const fresh = (await db.get(item._id)) as RequestOutboxItem;
    await db.remove(fresh._id, fresh._rev!);
  } catch {
    // schon weg — egal
  }
}

async function bumpAttempt(item: RequestOutboxItem): Promise<void> {
  try {
    const fresh = (await db.get(item._id)) as RequestOutboxItem;
    await db.put({
      ...fresh,
      lastAttempt: new Date().toISOString(),
      attempts: (fresh.attempts ?? 0) + 1,
    });
  } catch {
    // egal — nächster Tick versucht erneut
  }
}

/**
 * Versucht alle wartenden Requests in Prioritäts-Reihenfolge hochzuladen.
 * Wird vom 30-s-Worker + beim Online-Werden aufgerufen.
 *
 * Wichtig: läuft SEQUENZIELL (await in der Schleife), damit die Reihenfolge
 * Prio-1-vor-Prio-2 eingehalten wird (Daten-PUT vor Abschluss-POST).
 */
export async function flushRequestOutbox(): Promise<{
  total: number;
  ok: number;
  failed: number;
  pending: number;
}> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const pending = (await listPendingRequests()).filter((it) => !it.blocked).length;
    return { total: pending, ok: 0, failed: 0, pending };
  }
  // AUDIT-03 (Audit 2026-06-12): blockierte Items überspringen — sie warten
  // auf eine Reaktivierung (unblockRequests), nicht auf Netz.
  const items = (await listPendingRequests()).filter((it) => !it.blocked);
  if (items.length === 0) return { total: 0, ok: 0, failed: 0, pending: 0 };
  let ok = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await apiCall(item.path, { method: item.method, body: item.body });
      await removeItem(item);
      ok++;
    } catch (err) {
      // AUDIT-03 (Audit 2026-06-12): differenzierte Fehlerbehandlung.
      // - 423 (Schreibschutz): NICHT endlos retry'en — als blockiert markieren,
      //   eine Reaktivierung (unblockRequests) reicht das Item dann nach.
      // - 409 auf fahrzeugbericht-PUT: ebenfalls blockieren statt droppen —
      //   das Item ist der EINZIGE Träger des finalen Berichts.
      // - 409 auf /abschluss-POST bleibt droppable (already_closed = Ziel
      //   erreicht), genau wie echte Client-/Schema-Fehler (400/404/422).
      // - Netz-Fehler (status 0), Timeout, 401, 5xx → Retry beim nächsten Tick.
      if (err instanceof ApiError && err.status === 423) {
        await markBlocked(item, 423);
        failed++;
      } else if (
        err instanceof ApiError &&
        err.status === 409 &&
        item.path.includes("/fahrzeugbericht/")
      ) {
        await markBlocked(item, 409);
        failed++;
      } else if (err instanceof ApiError && [400, 404, 409, 422].includes(err.status)) {
        await removeItem(item);
        failed++;
      } else {
        await bumpAttempt(item);
        failed++;
      }
    }
  }
  const rest = (await listPendingRequests()).filter((it) => !it.blocked).length;
  return { total: items.length, ok, failed, pending: rest };
}
