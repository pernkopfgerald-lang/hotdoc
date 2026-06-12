/**
 * AUDIT-03 (Audit 2026-06-12): Sync-Status-Hook für das persistente Badge
 * in der BerichtPage (und ab Welle 2 in der ZentralePage).
 *
 * Pollt alle 30 s beide Offline-Outboxen:
 *  - request-outbox (Fahrzeugbericht-PUTs, Abschluss-POSTs, Chronik-Einträge)
 *  - einsatz-outbox (offline angelegte Einsätze/Übungen/Lotsendienste)
 *
 * und aggregiert:
 *  - wartend:   Items die nur auf Netz warten (Flush-Worker reicht sie nach)
 *  - blockiert: Items mit blocked-Flag (423/409 — der Ziel-Bericht wurde
 *               zwischenzeitlich abgeschlossen; erst eine Reaktivierung
 *               via unblockRequests() reicht sie nach)
 *
 * Die Mannschaft sieht damit ehrlich, ob ihre Eingaben schon im Backend
 * sind — vorher arbeitete die Outbox unsichtbar im Hintergrund und ein
 * blockierter Bericht fiel erst beim Schriftführer auf.
 */

import { useEffect, useState } from "react";
import { listPending } from "./einsatz-outbox";
import { listPendingRequests } from "./request-outbox";

export interface SyncStatus {
  /** Übertragungen, die auf Netz warten (Outbox-Worker reicht nach). */
  wartend: number;
  /** Übertragungen, die blockiert sind (Bericht abgeschlossen → reaktivieren). */
  blockiert: number;
}

const POLL_INTERVAL_MS = 30_000;

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>({ wartend: 0, blockiert: 0 });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [requests, einsaetze] = await Promise.all([
          listPendingRequests(),
          listPending(),
        ]);
        if (cancelled) return;
        const blockiert = requests.filter((r) => !!r.blocked).length;
        const wartend = requests.length - blockiert + einsaetze.length;
        // Referenz nur bei echter Änderung tauschen — sonst re-rendert die
        // BerichtPage alle 30 s grundlos.
        setStatus((cur) =>
          cur.wartend === wartend && cur.blockiert === blockiert
            ? cur
            : { wartend, blockiert },
        );
      } catch {
        // PouchDB-Fehler → Badge behält den letzten Stand, nächster Tick.
      }
    };
    void tick();
    const t = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return status;
}
