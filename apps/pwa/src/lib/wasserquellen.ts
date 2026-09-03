/**
 * Löschwasser-Entnahmestellen (Hydranten, Behaelter, Teiche, Saugstellen...)
 * -- aus wasserkarte.info importiert und im Backoffice (Verwaltung >
 * Stammdaten > Löschwasser) verwaltet. Datenquelle: CouchDB ueber die API,
 * NICHT live von wasserkarte.info -- siehe apps/api/src/services/
 * wasserkarte-import.ts fuer den Hintergrund (keine oeffentliche Live-API).
 *
 * Bei Aenderungen an den Entnahmestellen exportiert der Funktionaer eine
 * frische KML bei wasserkarte.info und laedt sie im Backoffice hoch --
 * ersetzt den kompletten Datenbestand.
 */

import { apiCall } from "./api";
import { resolveApiUrl } from "./api";

export interface Wasserquelle {
  id: string;
  name: string;
  /** Grobe Kategorie fuer Fallback-Badge ohne Icon-Bild. */
  typ: "H" | "S" | "T";
  /** Echter wasserkarte.info-Typ, z. B. "Ueberflurhydrant", "Loeschwasserteich". */
  typLabel: string;
  /** Anschluesse/Kupplungen als Freitext, z. B. "2xC 1xB" -- leer wenn nicht erfasst. */
  anschluss: string;
  lat: number;
  lng: number;
}

interface WasserquellenResponse {
  ok: boolean;
  count: number;
  importedAm: string | null;
  items: Wasserquelle[];
}

let cache: Promise<Wasserquelle[]> | null = null;

/** Laedt die Wasserquellen-Liste einmalig -- Ergebnis wird modulweit
 *  gecacht, alle Karten-Komponenten teilen sich einen Fetch. */
export function loadWasserquellen(): Promise<Wasserquelle[]> {
  cache ??= apiCall<WasserquellenResponse>("/api/wasserquellen")
    .then((res) => res.items)
    .catch(() => []);
  return cache;
}

/** Absolute URL des offiziellen wasserkarte.info-Icons (oeffentlich, kein
 *  Auth-Header noetig -- wird direkt in einem Leaflet-L.icon/<img> genutzt). */
export function wasserquelleIconUrl(id: string): string {
  return resolveApiUrl(`/api/wasserquellen/icons/${id}`);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Gemeinsamer Popup-Inhalt fuer Leaflet-Marker (MapCard + FlorianMap). */
export function wasserquellePopupHtml(q: {
  name: string;
  typLabel?: string;
  anschluss?: string;
}): string {
  const lines = [
    `<strong>${escapeHtml(q.name)}</strong>`,
    q.typLabel ? escapeHtml(q.typLabel) : "",
    q.anschluss ? `Anschlüsse: ${escapeHtml(q.anschluss)}` : "",
    '<span style="font-size:11px;color:#64748b;">Quelle: wasserkarte.info (Stand Import)</span>',
  ].filter(Boolean);
  return lines.join("<br/>");
}
