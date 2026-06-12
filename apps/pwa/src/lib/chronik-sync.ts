/**
 * Chronik-Cross-Sync zwischen allen Fahrzeugen.
 *
 * Architektur (Pilot-Stage-1):
 * - Quelle der Wahrheit: das Einsatz-Doc in CouchDB mit `chronik: Eintrag[]`
 * - Jedes Tablet pollt /api/einsaetze/:id/chronik alle 8 s
 * - Eingehende Einträge werden über entry.id dedupliziert und in den
 *   lokalen State der BerichtPage gemerged
 * - Lokale Einträge (Diktat, Auftrag) werden sowohl in den lokalen State
 *   gepusht als auch via POST /api/einsaetze/:id/chronik gebroadcastet
 *
 * Offline-Fallback (AUDIT-03, 2026-06-12): Wenn der POST am Netz scheitert,
 * landet der Eintrag in der PERSISTENTEN request-outbox (PouchDB) — der
 * 30-s-Worker in App.tsx reicht ihn nach. Die frühere In-Memory-Queue
 * (pendingByEinsatz) hat einen Reload/OOM-Kill nicht überlebt: der Eintrag
 * stand lokal in der Timeline, erreichte aber nie ein anderes Gerät.
 */

import { apiCall, ApiError } from "./api";
import { enqueueRequest } from "./request-outbox";
import type { ChronikEintrag } from "../components/ChronikTimeline";

interface PostBody {
  id: string;
  zeitstempel: string;
  funkrufname: string;
  fahrzeugId: string;
  source: ChronikEintrag["source"];
  text: string;
  pending?: boolean;
  // Foto-Funktion (2026-06-03): Referenz auf das foto:-Doc (falls Foto-Eintrag).
  fotoId?: string;
}

interface PostResponse {
  ok: boolean;
  rev?: string;
  total?: number;
  deduped?: boolean;
}

interface GetResponse {
  ok: boolean;
  id: string;
  chronik: ChronikEintrag[];
  geaendertAm?: string;
}

/**
 * Sendet einen Chronik-Eintrag an den Server. Wirft NIE — der Aufrufer
 * wertet das Ergebnis aus:
 *  - 'ok'       → angekommen (oder serverseitig dedupliziert)
 *  - 'queued'   → kein Netz/Server-Problem; Eintrag liegt in der persistenten
 *                 Outbox und wird automatisch nachgereicht. KEIN Fehler —
 *                 der optimistische lokale Eintrag bleibt stehen.
 *  - 'rejected' → Server lehnt endgültig ab (404 Einsatz weg, 423 Bericht
 *                 abgeschlossen). Der Aufrufer muss den lokalen Eintrag
 *                 markieren/entfernen und den User informieren.
 */
export async function broadcastChronikEntry(
  einsatzId: string,
  entry: PostBody,
): Promise<"ok" | "queued" | "rejected"> {
  try {
    await apiCall<PostResponse>(`/api/einsaetze/${encodeURIComponent(einsatzId)}/chronik`, {
      method: "POST",
      body: entry,
    });
    return "ok";
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 423)) {
      // Einsatz existiert nicht (mehr) im Backend ODER ist schreibgeschützt
      // → Retry sinnlos, NICHT queuen.
      console.warn(`[chronik-sync] ${einsatzId} ${err.status}: ${err.message}`);
      return "rejected";
    }
    // Netz-Fehler / Timeout / 5xx → persistent in die request-outbox parken.
    // Der Endpoint dedupliziert über entry.id — ein Doppel-POST (direkter
    // Retry + Outbox-Flush) ist harmlos.
    try {
      await enqueueRequest(
        1,
        `chronik:${entry.id}`,
        "POST",
        `/api/einsaetze/${encodeURIComponent(einsatzId)}/chronik`,
        entry as unknown as Record<string, unknown>,
      );
    } catch {
      // PouchDB-Fehler — der lokale Timeline-Eintrag bleibt als letzter Stand.
    }
    console.warn(`[chronik-sync] queued ${entry.id} (${(err as Error).message})`);
    return "queued";
  }
}

/**
 * Holt aktuelle Chronik vom Server und liefert neue Einträge zurück,
 * die im übergebenen Set noch fehlen. Das Nachreichen gescheiterter
 * Broadcasts übernimmt seit AUDIT-03 der 30-s-Outbox-Worker in App.tsx
 * (persistente request-outbox) — kein Re-Post-Side-Effect mehr hier.
 *
 * BEWUSSTE DESIGN-ENTSCHEIDUNG (Einsatz-Test 2026-06-02, v0.1.10):
 * Der Diff filtert NUR nach unbekannten entry.id — ein nachträglich
 * EDITIERTER Eintrag (Issue 6, gleiche id, neuer Text) wird auf anderen
 * Tablets NICHT live ersetzt, erst nach Reload/Refetch. Das ist Absicht:
 * Edits sind selten (Tippfehler-Korrektur durch Florian/Ursprungsfahrzeug),
 * die editierende Stelle sieht die Änderung sofort (optimistic patch), und
 * ein Timestamp-Merge würde diesen Sync-Hot-Path (läuft auf allen Tablets
 * alle 8s im Live-Einsatz) anfassen — das Risiko ist den Nutzen nicht wert.
 * NICHT "fixen" ohne explizite Freigabe. Siehe Plan-Diskussion Option A/B/C.
 */
export async function fetchChronikDiff(
  einsatzId: string,
  bekannteIds: Set<string>,
): Promise<ChronikEintrag[]> {
  try {
    const r = await apiCall<GetResponse>(
      `/api/einsaetze/${encodeURIComponent(einsatzId)}/chronik`,
    );
    return r.chronik.filter((e) => !bekannteIds.has(e.id));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Einsatz noch nicht in CouchDB — Replication-Latenz.
      return [];
    }
    // Netz-Aussetzer ist harmlos, nächster Poll versucht's wieder
    return [];
  }
}
