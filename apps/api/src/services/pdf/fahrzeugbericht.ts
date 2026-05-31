/**
 * Fahrzeugbericht-PDF im Stil des Originalvordrucks der FF Eberstalzell.
 *
 * Layout 1:1 nach Original-PDF (siehe docs/Fahrzeugdatenblatt.pdf):
 *   Header: FF-Eberstalzell-Logo (Wappen) links + Mitte, "Fahrzeugbericht"
 *           rechts auf horizontaler Linie
 *   Tabelle 1: Einsatzort · Datum · Uhrzeit von · Uhrzeit bis (4 Zeilen)
 *   Tabelle 2: Fahrzeug "KDO / TANK / LFB-A2 / MTF / HR Anhänger" + Kilometer
 *   Tabelle 3: Fahrer · Fahrzeug-Kdt. · Mannschaft 1-7 mit AS rechts
 *              ("Mannschaft"-Label rowspan über 7 Slots, AS fett wenn aktiv)
 *   Block 4:   Geräte, Mittel mit Sub-Text-Beispielen
 *   Footer:    Schwarzer Balken rechts "Näherer Tätigkeitsbericht auf Rückseite"
 *
 * Seite 2 (Rückseite):
 *   Header: Logo + Fahrzeug-Funkrufname + Einsatzort + Datum
 *   Tätigkeitsbericht (Freitext)
 *   Einsatzchronik-Tabelle (sortiert nach Zeit)
 *
 * Werte schwarz (nicht blau) — soll wie ein ausgefüllter Papier-Vordruck
 * aussehen, nicht wie eine elektronische Auswertung.
 *
 * Die Single-Page-Funktion `renderFahrzeugberichtPageHtml` wird auch vom
 * Hauptbericht-PDF (template.ts) als Anhang-Seite re-used, damit beide
 * Varianten konsistent das Original-Layout zeigen.
 */

import { getBrandLogoDataUrl } from "./brand.js";

const FAHRZEUG_LABELS: Record<string, string> = {
  kdo: "KDO",
  "tlf-a-4000": "TLF-A 4000",
  "lfa-b": "LFA-B",
  mtf: "MTF",
  zentrale: "Florian Eberstalzell",
};

export interface FahrzeugberichtDaten {
  einsatzId: string;
  fahrzeugId: string;
  abk: string;
  funkrufname: string;
  einsatzort: string;
  /** ISO-Timestamp Alarmierung / Beginn. */
  alarmierungZeit: string;
  /** Wenn gesetzt: aus zeit.bis gepflegt — entweder manuell oder beim Abschluss. */
  zeitBis?: string;
  kmGefahren: number;
  fahrer?: string;
  fahrzeugKdt?: string;
  /** Mindestens 7 Slots, leere bleiben leer. */
  mannschaft: Array<{
    name: string;
    rang?: string;
    atemschutzAktiv: boolean;
    atemschutzDauerMin?: number;
  }>;
  geraete: string[];
  oelSaecke: number;
  taetigkeitsbericht: string;
  /** Optional: Einsatzchronik des gesamten Einsatzes — Seite 2. */
  chronik: Array<{
    zeitstempel: string;
    funkrufname: string;
    text: string;
    source: string;
  }>;
  status: "in_arbeit" | "abgeschlossen";
}

/**
 * Inline-Styles statt CSS-Klassen — damit die Funktion auch von außen
 * (template.ts:renderFahrzeugberichtSeiten) re-used werden kann ohne
 * Class-Name-Konflikte.
 */
export function renderFahrzeugberichtPageHtml(d: FahrzeugberichtDaten): string {
  const datum = formatDate(d.alarmierungZeit);
  const vonStr = formatTime(d.alarmierungZeit);
  const bisStr = d.zeitBis ? formatTime(d.zeitBis) : "";
  const kmStr = d.kmGefahren > 0 ? `${d.kmGefahren.toFixed(1).replace(".", ",")} km` : "";
  const fahrzeugStr = `${d.abk}${d.funkrufname ? ` “${d.funkrufname}”` : ""}`;
  const geraeteList = d.geraete.length > 0 ? d.geraete.join(", ") : "";

  // Mannschafts-Liste auf 7 Slots auffüllen
  const mannschaftPadded: Array<{
    name: string;
    rang?: string;
    atemschutzAktiv: boolean;
    atemschutzDauerMin?: number;
  } | null> = [];
  for (let i = 0; i < 7; i++) {
    mannschaftPadded.push(d.mannschaft[i] ?? null);
  }

  const logo = renderBrandLogo();
  const tdLbl =
    'style="border:0.8pt solid #000;padding:5pt 8pt;vertical-align:middle;width:38mm;font-weight:700;font-size:12pt;font-family:Arial,sans-serif"';
  const tdVal =
    'style="border:0.8pt solid #000;padding:5pt 8pt;vertical-align:middle;font-size:12pt;font-weight:600;font-family:Arial,sans-serif"';
  const tdNo =
    'style="border:0.8pt solid #000;padding:5pt 8pt 5pt 10pt;vertical-align:middle;width:8mm;font-weight:700;font-size:12pt;font-family:Arial,sans-serif"';
  const tdName =
    'style="border:0.8pt solid #000;padding:5pt 8pt;vertical-align:middle;font-size:12pt;font-weight:500;font-family:Arial,sans-serif"';
  const tdAs =
    'style="border:0.8pt solid #000;padding:5pt 10pt 5pt 8pt;vertical-align:middle;width:20mm;text-align:right;font-weight:700;font-size:12pt;font-family:Arial,sans-serif"';

  return /* html */ `
  <!-- ═══ Fahrzeugbericht Vorderseite — Tabellen-Layout ═══════════ -->
  <div style="font-family:Arial,'Helvetica Neue',sans-serif;color:#000">

    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding-bottom:6mm;border-bottom:1pt solid #000;margin-bottom:8mm">
      <div style="display:flex;align-items:center;gap:14px">
        ${logo ? `<img src="${logo}" alt="FF Eberstalzell" style="height:18mm;width:auto" />` : ""}
        <strong style="font-weight:700;font-size:18pt;text-decoration:underline;text-underline-offset:3pt;letter-spacing:-0.01em">FF Eberstalzell</strong>
      </div>
      <strong style="font-weight:700;font-size:22pt;letter-spacing:-0.01em">Fahrzeugbericht</strong>
    </div>

    ${
      d.status === "in_arbeit"
        ? `<span style="padding:3pt 9pt;background:#d97706;color:#fff;font-size:9pt;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;display:inline-block;margin-bottom:4mm;font-family:Arial,sans-serif">In Arbeit — noch nicht abgeschlossen</span>`
        : ""
    }

    <!-- Tabelle 1: Einsatzort / Datum / Uhrzeit von / Uhrzeit bis -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm">
      <tr><td ${tdLbl}>Einsatzort</td><td ${tdVal}>${escape(d.einsatzort)}</td></tr>
      <tr><td ${tdLbl}>Datum</td><td ${tdVal}>${escape(datum)}</td></tr>
      <tr><td ${tdLbl}>Uhrzeit von</td><td ${tdVal}>${escape(vonStr)}</td></tr>
      <tr><td ${tdLbl}>Uhrzeit bis</td><td ${tdVal}>${escape(bisStr)}</td></tr>
    </table>

    <!-- Tabelle 2: Fahrzeug + Kilometer -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm">
      <tr><td ${tdLbl}>Fahrzeug</td><td ${tdVal}>${escape(fahrzeugStr)}</td></tr>
      <tr><td ${tdLbl}>Kilometer</td><td ${tdVal}>${escape(kmStr)}</td></tr>
    </table>

    <!-- Tabelle 3: Fahrer + Kdt + Mannschaft 1-7 -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm">
      <tr>
        <td ${tdLbl}>Fahrer</td>
        <td colspan="2" ${tdName}>${escape(d.fahrer ?? "")}</td>
        <td ${tdAs}></td>
      </tr>
      <tr>
        <td ${tdLbl}>Fahrzeug-Kdt.</td>
        <td colspan="2" ${tdName}>${escape(d.fahrzeugKdt ?? "")}</td>
        <td ${tdAs}></td>
      </tr>
      ${mannschaftPadded
        .map(
          (m, i) => `<tr>
            ${i === 0 ? `<td ${tdLbl} rowspan="7">Mannschaft</td>` : ""}
            <td ${tdNo}>${i + 1}</td>
            <td ${tdName}>${m ? escape(m.name) : ""}</td>
            <td ${tdAs}>${m?.atemschutzAktiv ? "AS" : ""}</td>
          </tr>`,
        )
        .join("")}
    </table>

    <!-- Tabelle 4: Geräte, Mittel -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:5mm">
      <tr>
        <td style="border:0.8pt solid #000;padding:5pt 8pt;vertical-align:top;width:38mm;font-weight:700;font-size:12pt;font-family:Arial,sans-serif">
          Geräte, Mittel
          <small style="display:block;font-weight:400;font-size:8.5pt;color:#000;margin-top:4pt;line-height:1.45">Pumpe, Generator,<br/>Seilwinde, Leiter, Lüfter<br/>Ölbindemittel, etc.</small>
        </td>
        <td style="border:0.8pt solid #000;padding:5pt 8pt;vertical-align:top;font-size:12pt;font-weight:500;font-family:Arial,sans-serif;min-height:28mm;height:28mm;white-space:pre-line">${escape(geraeteList)}${d.oelSaecke > 0 ? `\nÖlbindemittel: ${d.oelSaecke} Sack` : ""}</td>
      </tr>
    </table>

    <div style="margin-top:6mm;padding:4pt 10pt;background:#000;color:#fff;font-weight:700;font-size:11pt;text-align:right;letter-spacing:0.01em;font-family:Arial,sans-serif">Näherer Tätigkeitsbericht auf Rückseite</div>
  </div>`;
}

/**
 * Komplettes 2-Seiten-PDF: Vorderseite (Tabellen-Layout) + Rückseite
 * (Tätigkeitsbericht + Einsatzchronik). Wird vom standalone-Endpoint
 * `/api/einsaetze/:id/fahrzeugbericht/:fzgId/pdf` aufgerufen.
 */
export function renderFahrzeugberichtHtml(d: FahrzeugberichtDaten): string {
  const datum = formatDate(d.alarmierungZeit);
  const vonStr = formatTime(d.alarmierungZeit);
  const fahrzeugStr = `${d.abk}${d.funkrufname ? ` “${d.funkrufname}”` : ""}`;

  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Fahrzeugbericht ${escape(d.abk)} · ${escape(d.einsatzId)}</title>
  <style>
    @page { size: A4 portrait; margin: 16mm 16mm 18mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 11pt;
      line-height: 1.35;
    }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .freitext {
      min-height: 80mm;
      padding: 6pt 8pt;
      border: 0.8pt solid #000;
      white-space: pre-wrap;
      font-size: 11pt;
      line-height: 1.55;
      margin-bottom: 7mm;
    }
    .freitext:empty::before { content: "—"; color: #999; }
    table.chronik { width: 100%; border-collapse: collapse; font-size: 10pt; }
    table.chronik td {
      border-bottom: 0.4pt solid #ccc;
      padding: 3pt 6pt;
      vertical-align: top;
    }
    table.chronik thead td {
      border-bottom: 1pt solid #000;
      background: #eee;
      font-weight: 700;
      font-size: 9pt;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    table.chronik .ts {
      width: 18mm;
      font-family: "Courier New", monospace;
    }
    table.chronik .src {
      width: 40mm;
      font-weight: 600;
    }
    table.chronik .empty {
      text-align: center;
      color: #888;
      font-style: italic;
      padding: 10pt;
    }
    h2.section {
      font-size: 13pt;
      font-weight: 700;
      margin: 0 0 3mm;
      padding-bottom: 3pt;
      border-bottom: 1pt solid #000;
    }
    .p2-head {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6mm;
      padding-bottom: 4mm;
      border-bottom: 1pt solid #000;
      margin-bottom: 6mm;
      font-size: 11pt;
    }
    .p2-head .lbl {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 2pt;
    }
    .p2-head .v {
      font-size: 12pt;
      font-weight: 700;
    }
  </style>
</head>
<body>

  <div class="page">
    ${renderFahrzeugberichtPageHtml(d)}
  </div>

  <div class="page">
    <div class="p2-head">
      <div>
        <div class="lbl">Fahrzeug</div>
        <div class="v">${escape(fahrzeugStr)}</div>
      </div>
      <div>
        <div class="lbl">Einsatz · ${escape(datum)}${vonStr ? ` · ab ${escape(vonStr)}` : ""}</div>
        <div class="v">${escape(d.einsatzort)}</div>
      </div>
    </div>

    <h2 class="section">Tätigkeitsbericht</h2>
    <div class="freitext">${escape(d.taetigkeitsbericht)}</div>

    <h2 class="section">Einsatzchronik · gesamter Einsatz</h2>
    <table class="chronik">
      <thead>
        <tr>
          <td class="ts">Zeit</td>
          <td class="src">Quelle</td>
          <td>Eintrag</td>
        </tr>
      </thead>
      <tbody>
        ${
          d.chronik.length === 0
            ? `<tr><td colspan="3" class="empty">Keine Chronik-Einträge erfasst.</td></tr>`
            : d.chronik
                .slice()
                .sort(
                  (a, b) =>
                    new Date(a.zeitstempel).getTime() -
                    new Date(b.zeitstempel).getTime(),
                )
                .map(
                  (c) => `<tr>
                <td class="ts">${formatTime(c.zeitstempel)}</td>
                <td class="src">${escape(c.funkrufname)}</td>
                <td>${escape(c.text)}</td>
              </tr>`,
                )
                .join("")
        }
      </tbody>
    </table>
  </div>

</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────

function escape(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "";
    return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
  } catch {
    return "";
  }
}

function formatTime(iso: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return "";
    return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  } catch {
    return "";
  }
}

function renderBrandLogo(): string {
  return getBrandLogoDataUrl();
}

/** Mapper-Helper fuer pdf.ts: FahrzeugId → Anzeige-Abk. */
export function fahrzeugAbk(fahrzeugId: string): string {
  return FAHRZEUG_LABELS[fahrzeugId] ?? fahrzeugId.toUpperCase();
}
