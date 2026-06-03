/**
 * Geteilte Formatier- und Render-Helfer für die PDF-Templates.
 *
 * Diese Funktionen waren vorher 4×-fach identisch über template.ts,
 * fahrzeugbericht.ts, uebung.ts und lotsendienst.ts kopiert. Hier
 * zentralisiert, verhaltensgleich zu den bisherigen Implementierungen.
 *
 * Hinweis Datums-Helfer: bei einem gültigen ISO-String liefern alle
 * bisherigen Kopien dasselbe Ergebnis. Der einzige Unterschied lag im
 * Verhalten bei UNGÜLTIGEN Strings — hier wird die robustere Variante
 * (Number.isNaN-Check → leerer String statt "NaN.NaN.NaN") verwendet,
 * da kaputte Datumswerte im PDF ohnehin nutzlos wären.
 */

import { getBrandLogoDataUrl } from "./brand.js";

/**
 * HTML-Escaping. Permissivste Signatur (`string | null | undefined`),
 * damit alle bisherigen Aufrufer weiter kompilieren — fahrzeugbericht.ts
 * rief escape() teils mit null/undefined auf.
 */
export function escape(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Zwei-Stellen-Zero-Padding für Datums-/Zeit-Komponenten. */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO-Timestamp → "TT.MM.JJJJ". Leerer String bei ungültigem Datum. */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  } catch {
    return "";
  }
}

/** ISO-Timestamp → "HH:MM". Leerer String bei ungültigem Datum. */
export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

/** ISO-Timestamp → "TT.MM.JJJJ HH:MM". */
export function formatDateTime(iso: string): string {
  try {
    return `${formatDate(iso)} ${formatTime(iso)}`;
  } catch {
    return iso;
  }
}

/** Differenz zweier ISO-Timestamps in Minuten (>= 0, 0 bei ungültig). */
export function calcDauerMin(vonIso: string, bisIso: string): number {
  try {
    const von = new Date(vonIso).getTime();
    const bis = new Date(bisIso).getTime();
    if (Number.isNaN(von) || Number.isNaN(bis)) return 0;
    return Math.max(0, Math.floor((bis - von) / 60_000));
  } catch {
    return 0;
  }
}

/**
 * Rendert das offizielle FF-Eberstalzell-Logo als `<img class="hd-logo">`-
 * Tag mit Base64-Data-URL. Bei fehlender Logo-Datei wird leer gerendert —
 * niemals eine Fake-Annäherung. Die `.hd-logo`-CSS-Regel definiert das
 * jeweilige Template lokal (unterschiedliche Höhen je Layout).
 */
export function renderBrandLogo(): string {
  const dataUrl = getBrandLogoDataUrl();
  if (!dataUrl) return "";
  return `<img class="hd-logo" src="${dataUrl}" alt="FF Eberstalzell" />`;
}

/**
 * Nackte Logo-Data-URL (ohne `<img>`-Wrapper) — für fahrzeugbericht.ts,
 * das das img-Tag inline mit eigenem Style baut.
 */
export function brandLogoDataUrl(): string {
  return getBrandLogoDataUrl();
}
