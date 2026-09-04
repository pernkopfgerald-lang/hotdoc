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

/**
 * D-13 (Audit R3): Zeitzone im PDF ist IMMER Europe/Vienna — unabhängig
 * von der TZ des API-Prozesses (Docker-Container laufen typischerweise in
 * UTC, dann stand im PDF "12:05" statt "14:05"). Die Formatter werden
 * lazy und nur einmal gebaut; sollte die ICU des Node-Builds die Zone
 * nicht kennen (small-icu), fällt formatDate/formatTime auf die lokale
 * Prozess-Zeit zurück statt beim Import zu crashen.
 */
const PDF_ZEITZONE = "Europe/Vienna";
let viennaDateFmtCache: Intl.DateTimeFormat | null | undefined;
let viennaTimeFmtCache: Intl.DateTimeFormat | null | undefined;

function viennaDateFmt(): Intl.DateTimeFormat | null {
  if (viennaDateFmtCache === undefined) {
    try {
      viennaDateFmtCache = new Intl.DateTimeFormat("de-AT", {
        timeZone: PDF_ZEITZONE,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      viennaDateFmtCache = null;
    }
  }
  return viennaDateFmtCache;
}

function viennaTimeFmt(): Intl.DateTimeFormat | null {
  if (viennaTimeFmtCache === undefined) {
    try {
      viennaTimeFmtCache = new Intl.DateTimeFormat("de-AT", {
        timeZone: PDF_ZEITZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      viennaTimeFmtCache = null;
    }
  }
  return viennaTimeFmtCache;
}

/**
 * formatToParts → { day, month, year, hour, minute }. Wir setzen die
 * Teile selbst zusammen statt format() zu nehmen, damit das Ergebnis nicht
 * von ICU-Locale-Details (Trennzeichen, Leerzeichen, "24:00"-Mitternacht)
 * abhängt.
 */
function zeitTeile(fmt: Intl.DateTimeFormat, d: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type === "literal") continue;
    const n = Number(p.value);
    if (Number.isFinite(n)) out[p.type] = n;
  }
  return out;
}

/** ISO-Timestamp → "TT.MM.JJJJ" (Europe/Vienna). Leerer String bei ungültigem Datum. */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const fmt = viennaDateFmt();
    if (!fmt) {
      // Fallback ohne ICU-Zone: lokale Prozess-Zeit (bisheriges Verhalten).
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
    }
    const t = zeitTeile(fmt, d);
    if (t.day === undefined || t.month === undefined || t.year === undefined) return "";
    return `${pad(t.day)}.${pad(t.month)}.${t.year}`;
  } catch {
    return "";
  }
}

/** ISO-Timestamp → "HH:MM" (Europe/Vienna, 24h). Leerer String bei ungültigem Datum. */
export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const fmt = viennaTimeFmt();
    if (!fmt) {
      // Fallback ohne ICU-Zone: lokale Prozess-Zeit (bisheriges Verhalten).
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    const t = zeitTeile(fmt, d);
    if (t.hour === undefined || t.minute === undefined) return "";
    // Ältere ICU-Versionen liefern bei hour12:false "24" für Mitternacht.
    return `${pad(t.hour % 24)}:${pad(t.minute)}`;
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
