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
 * Offline-Fallback: Wenn der POST fehlschlägt (kein Netz), bleibt der
 * Eintrag lokal. Beim nächsten erfolgreichen Poll erkennt der Server
 * den Eintrag nicht — wir hängen ihn dann mit dem nächsten POST nach,
 * sobald wieder Netz da ist (in pendingBroadcastQueue gemerkt).
 */

import { apiCall, ApiError } from "./api";
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

// Lokaler Outbox-Puffer für Einträge die noch nicht erfolgreich
// gepostet werden konnten (Offline-Modus).
const pendingByEinsatz: Map<string, Map<string, PostBody>> = new Map();

function pending(einsatzId: string): Map<string, PostBody> {
  let m = pendingByEinsatz.get(einsatzId);
  if (!m) {
    m = new Map();
    pendingByEinsatz.set(einsatzId, m);
  }
  return m;
}

/**
 * Sendet einen Chronik-Eintrag an den Server. Schwächt nicht-online-Fehler
 * ab — wirft nur bei expliziten Validierungs-/Auth-Fehlern.
 */
export async function broadcastChronikEntry(
  einsatzId: string,
  entry: PostBody,
): Promise<void> {
  try {
    await apiCall<PostResponse>(`/api/einsaetze/${encodeURIComponent(einsatzId)}/chronik`, {
      method: "POST",
      body: entry,
    });
    pending(einsatzId).delete(entry.id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 423)) {
      // Einsatz existiert (noch) nicht im Backend ODER ist schreibgeschützt
      // → lokal nicht weiter retry'en
      console.warn(`[chronik-sync] ${einsatzId} ${err.status}: ${err.message}`);
      return;
    }
    // Netz-Fehler oder 5xx → in Outbox für späteren Retry parken
    pending(einsatzId).set(entry.id, entry);
    console.warn(`[chronik-sync] queued ${entry.id} (${(err as Error).message})`);
  }
}

/**
 * Holt aktuelle Chronik vom Server und liefert neue Einträge zurück,
 * die im übergebenen Set noch fehlen. Side-effect: queued-out broadcasts
 * werden mit der gleichen Gelegenheit re-posted.
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
  // Erst pending-Queue abarbeiten (best effort, blockt nicht)
  const q = pending(einsatzId);
  if (q.size > 0) {
    for (const e of [...q.values()]) {
      void broadcastChronikEntry(einsatzId, e);
    }
  }

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
