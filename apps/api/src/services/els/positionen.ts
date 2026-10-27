/**
 * Fahrzeugpositionen: Funkposition aus ELS hat Vorrang vor dem Tablet-GPS.
 *
 * ELS liefert die Position der Einheit (ca. minutenaktuell, Abruf alle 60 s).
 * Nur wenn ELS fuer ein Fahrzeug keine (frische) Position hat — Schnittstelle
 * aus, Einheit nicht zugeordnet, Funkgeraet ohne GPS — gilt der Ping des
 * Tablets als Rueckfall. Ohne ELS-Anbindung aendert sich nichts.
 */

import type { FahrzeugFunkstatus } from "./logik.js";

export interface PingLike {
  fahrzeugId: string;
  lat: number;
  lng: number;
  ts: string;
}

export type MitQuelle<T extends PingLike> = T & { source: "tablet" | "els" };

/** ELS-Daten aelter als das gelten nicht mehr als Position (Poll alle 60 s). */
export const ELS_POSITION_MAX_ALTER_MS = 3 * 60 * 1000;

export function mitElsVorrang<T extends PingLike>(
  tabletPings: T[],
  els: { fetchedAt: string; status: FahrzeugFunkstatus[] } | null,
  jetztMs: number = Date.now(),
): Array<MitQuelle<T> | MitQuelle<PingLike>> {
  const items: Array<MitQuelle<T> | MitQuelle<PingLike>> = tabletPings.map((p) => ({
    ...p,
    source: "tablet" as const,
  }));
  if (!els) return items;
  const alter = jetztMs - Date.parse(els.fetchedAt);
  if (!Number.isFinite(alter) || alter > ELS_POSITION_MAX_ALTER_MS) return items;
  for (const s of els.status) {
    if (s.lat === null || s.lng === null) continue;
    const el: MitQuelle<PingLike> = {
      fahrzeugId: s.fahrzeugId,
      lat: s.lat,
      lng: s.lng,
      ts: els.fetchedAt,
      source: "els",
    };
    const idx = items.findIndex((p) => p.fahrzeugId === s.fahrzeugId);
    if (idx >= 0) items.splice(idx, 1, el);
    else items.push(el);
  }
  return items;
}
