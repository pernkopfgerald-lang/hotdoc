import { useCallback, useEffect, useRef, useState } from "react";
import {
  EINSAETZE_MAX_LIMIT,
  listEinsaetzeSeite,
  type EinsatzListItem,
} from "../api/einsaetze";

export type EinsatzStatusFilter = "alle" | "aktiv" | "abgeschlossen";

/** Berichte pro "Mehr laden"-Schritt (= Server-Default). */
export const EINSAETZE_SEITE = 200;

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Doppelte _id (Verschiebung der Sortierung zwischen zwei Seiten-Abrufen) entfernen. */
function ohneDuplikate(items: EinsatzListItem[]): EinsatzListItem[] {
  const gesehen = new Set<string>();
  return items.filter((it) => {
    if (gesehen.has(it._id)) return false;
    gesehen.add(it._id);
    return true;
  });
}

/**
 * Berichtsliste mit "Mehr laden" (Archiv + Berichte-Browser).
 *  - Statuswechsel laedt von vorn (erste Seite).
 *  - `reload` holt wieder mindestens so viele Berichte, wie schon angezeigt
 *    werden (nach Bearbeiten/Loeschen bleibt der Scroll-Stand erhalten).
 *  - `loadMore` haengt die naechste Seite an.
 */
export function useEinsatzListe(status: EinsatzStatusFilter) {
  const [items, setItems] = useState<EinsatzListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const itemsRef = useRef<EinsatzListItem[]>([]);
  /** Nur die jeweils juengste Anfrage darf den State schreiben (Filterwechsel-Rennen). */
  const reqRef = useRef(0);
  const statusParam = status === "alle" ? undefined : status;

  const reload = useCallback(async () => {
    const req = ++reqRef.current;
    setBusy(true);
    setLoadingMore(false);
    setErr(null);
    try {
      const ziel = Math.max(EINSAETZE_SEITE, itemsRef.current.length);
      let acc: EinsatzListItem[] = [];
      let gesamt = 0;
      // Mehrere Abrufe nur, wenn schon mehr als das Server-Maximum geladen war.
      for (;;) {
        const s = await listEinsaetzeSeite({
          ...(statusParam ? { status: statusParam } : {}),
          skip: acc.length,
          limit: Math.min(EINSAETZE_MAX_LIMIT, ziel - acc.length),
        });
        gesamt = s.total;
        acc = acc.concat(s.items);
        if (acc.length >= ziel || acc.length >= gesamt || s.items.length === 0) break;
      }
      if (req !== reqRef.current) return;
      const liste = ohneDuplikate(acc);
      itemsRef.current = liste;
      setItems(liste);
      setTotal(gesamt);
    } catch (e) {
      if (req === reqRef.current) setErr(fehlerText(e));
    } finally {
      if (req === reqRef.current) setBusy(false);
    }
  }, [statusParam]);

  const loadMore = useCallback(async () => {
    const req = ++reqRef.current;
    setLoadingMore(true);
    setBusy(false);
    setErr(null);
    try {
      const s = await listEinsaetzeSeite({
        ...(statusParam ? { status: statusParam } : {}),
        skip: itemsRef.current.length,
        limit: EINSAETZE_SEITE,
      });
      if (req !== reqRef.current) return;
      const liste = ohneDuplikate(itemsRef.current.concat(s.items));
      itemsRef.current = liste;
      setItems(liste);
      setTotal(s.total);
    } catch (e) {
      if (req === reqRef.current) setErr(fehlerText(e));
    } finally {
      if (req === reqRef.current) setLoadingMore(false);
    }
  }, [statusParam]);

  // Anfangsladen + Filterwechsel: von vorn beginnen.
  useEffect(() => {
    itemsRef.current = [];
    setItems([]);
    setTotal(null);
    void reload();
  }, [reload]);

  return { items, total, busy, loadingMore, err, reload, loadMore };
}
