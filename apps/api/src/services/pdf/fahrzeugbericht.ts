/**
 * Fahrzeugbericht-PDF im Stil der Papier-Vorlage der FF Eberstalzell.
 *
 * Layout 1:1 nach dem Originalvordruck:
 *   Header: "FF Eberstalzell" (unterstrichen, links) +
 *           "Fahrzeugbericht" (groß, rechts) auf horizontaler Linie
 *   Tabelle 1: Einsatzort · Datum · Uhrzeit von · Uhrzeit bis
 *   Tabelle 2: Fahrzeug (nur Klartext-Zeile, KEINE Checkbox-Reihe!) ·
 *              Kilometer
 *   Tabelle 3: Fahrer · Fahrzeug-Kdt. · Mannschaft 1-7 mit
 *              "Mannschaft"-Label rowspan über die 7 Slots, AS rechts
 *              als fetter Text NUR wenn aktiv (sonst leer)
 *   Block 4:   Geräte, Mittel mit Hinweis-Beispielen im Label-Sub-Text
 *   Footer:    Schwarzer Balken "Näherer Tätigkeitsbericht auf Rückseite"
 *
 * Seite 2 (Rückseite):
 *   Header: Fahrzeug-Funkrufname + Einsatzort + Datum
 *   Tätigkeitsbericht (Freitext, mehrzeilig)
 *   Einsatzchronik-Tabelle (sortiert nach Zeit)
 *
 * Wichtig: Werte werden SCHWARZ gerendert (nicht dunkelblau wie im
 * Hauptbericht) — der Fahrzeugbericht soll wie ein ausgefüllter
 * Papier-Vordruck aussehen, nicht wie eine elektronische Auswertung.
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
  /** Optional: Einsatzchronik des gesamten Einsatzes — wird auf Seite 2 mitgedruckt. */
  chronik: Array<{
    zeitstempel: string;
    funkrufname: string;
    text: string;
    source: string;
  }>;
  status: "in_arbeit" | "abgeschlossen";
}

export function renderFahrzeugberichtHtml(d: FahrzeugberichtDaten): string {
  const datum = formatDate(d.alarmierungZeit);
  const vonStr = formatTime(d.alarmierungZeit);
  const bisStr = d.zeitBis ? formatTime(d.zeitBis) : "";
  const kmStr = d.kmGefahren > 0 ? `${d.kmGefahren.toFixed(1).replace(".", ",")} km` : "";

  // Mannschafts-Liste auf 7 Slots auffuellen.
  const mannschaftPadded: Array<{
    name: string;
    rang?: string;
    atemschutzAktiv: boolean;
    atemschutzDauerMin?: number;
  } | null> = [];
  for (let i = 0; i < 7; i++) {
    mannschaftPadded.push(d.mannschaft[i] ?? null);
  }

  // Fahrzeug-Zeile: "LFA-B "Pumpe Eberstalzell"" — Abkuerzung + Funkrufname
  // in typografischen Doppel-Anfuehrungszeichen wie im Papier-Vordruck.
  const fahrzeugStr = `${d.abk}${d.funkrufname ? ` “${d.funkrufname}”` : ""}`;

  // Geraete-Liste: Komma-getrennt, plus separate Zeile fuer Ölbindemittel
  // wenn Saecke > 0.
  const geraeteList = d.geraete.length > 0 ? d.geraete.join(", ") : "";

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

    /* ─── Header ─────────────────────────────────────────── */
    .hd {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 6mm;
      border-bottom: 1pt solid #000;
      margin-bottom: 8mm;
    }
    .hd-l {
      font-weight: 700;
      font-size: 18pt;
      text-decoration: underline;
      text-underline-offset: 3pt;
      letter-spacing: -0.01em;
    }
    .hd-r {
      font-weight: 700;
      font-size: 22pt;
      letter-spacing: -0.01em;
    }

    /* ─── Allgemeine Tabellen-Optik (alle vier Bloecke) ──── */
    table.bx {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 5mm;
    }
    table.bx td {
      border: 0.8pt solid #000;
      padding: 5pt 8pt;
      vertical-align: middle;
    }
    table.bx td.lbl {
      width: 38mm;
      font-weight: 700;
      font-size: 12pt;
    }
    table.bx td.val {
      font-size: 12pt;
      font-weight: 600;
    }

    /* ─── Mannschafts-Block (Tabelle 3) ──────────────────── */
    table.crew {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 5mm;
    }
    table.crew td {
      border: 0.8pt solid #000;
      padding: 5pt 8pt;
      vertical-align: middle;
    }
    table.crew td.lbl {
      width: 38mm;
      font-weight: 700;
      font-size: 12pt;
    }
    table.crew td.lbl.merged {
      vertical-align: middle;
      text-align: left;
    }
    table.crew td.no {
      width: 8mm;
      font-weight: 700;
      text-align: left;
      font-size: 12pt;
      padding-left: 10pt;
    }
    table.crew td.name {
      font-size: 12pt;
      font-weight: 500;
    }
    table.crew td.as {
      width: 20mm;
      text-align: right;
      font-weight: 700;
      font-size: 12pt;
      padding-right: 10pt;
    }

    /* ─── Geraete-Block ──────────────────────────────────── */
    table.geraete {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 5mm;
    }
    table.geraete td {
      border: 0.8pt solid #000;
      padding: 5pt 8pt;
      vertical-align: top;
    }
    table.geraete td.lbl {
      width: 38mm;
      font-weight: 700;
      font-size: 12pt;
    }
    table.geraete td.lbl small {
      display: block;
      font-weight: 400;
      font-size: 8.5pt;
      color: #000;
      margin-top: 4pt;
      line-height: 1.45;
    }
    table.geraete td.val {
      font-size: 12pt;
      font-weight: 500;
      min-height: 28mm;
      height: 28mm;
      white-space: pre-line;
    }

    /* ─── Footer-Banner ──────────────────────────────────── */
    .ft {
      margin-top: 6mm;
      padding: 4pt 10pt;
      background: #000;
      color: #fff;
      font-weight: 700;
      font-size: 11pt;
      text-align: right;
      letter-spacing: 0.01em;
    }

    /* ─── Seite 2 — Ruekseite ────────────────────────────── */
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
    h2.section {
      font-size: 13pt;
      font-weight: 700;
      margin: 0 0 3mm;
      padding-bottom: 3pt;
      border-bottom: 1pt solid #000;
    }
    .freitext {
      min-height: 80mm;
      padding: 6pt 8pt;
      border: 0.8pt solid #000;
      white-space: pre-wrap;
      font-size: 11pt;
      line-height: 1.55;
      margin-bottom: 7mm;
    }
    .freitext:empty::before {
      content: "—";
      color: #999;
    }

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

    .status-banner {
      padding: 3pt 9pt;
      background: #d97706;
      color: #fff;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: inline-block;
      margin-bottom: 4mm;
    }
  </style>
</head>
<body>

  <!-- ═══ SEITE 1 — VORDERSEITE ═══════════════════════════ -->
  <div class="page">
    <div class="hd">
      <div class="hd-l">FF Eberstalzell</div>
      <div class="hd-r">Fahrzeugbericht</div>
    </div>

    ${d.status === "in_arbeit" ? `<span class="status-banner">In Arbeit — noch nicht abgeschlossen</span>` : ""}

    <!-- Tabelle 1: Einsatzort, Datum, Uhrzeit von, Uhrzeit bis -->
    <table class="bx">
      <tr><td class="lbl">Einsatzort</td><td class="val">${escape(d.einsatzort)}</td></tr>
      <tr><td class="lbl">Datum</td><td class="val">${escape(datum)}</td></tr>
      <tr><td class="lbl">Uhrzeit von</td><td class="val">${escape(vonStr)}</td></tr>
      <tr><td class="lbl">Uhrzeit bis</td><td class="val">${escape(bisStr)}</td></tr>
    </table>

    <!-- Tabelle 2: Fahrzeug-Text-Zeile + Kilometer -->
    <table class="bx">
      <tr><td class="lbl">Fahrzeug</td><td class="val">${escape(fahrzeugStr)}</td></tr>
      <tr><td class="lbl">Kilometer</td><td class="val">${escape(kmStr)}</td></tr>
    </table>

    <!-- Tabelle 3: Fahrer + Kdt + Mannschaft 1-7 mit "Mannschaft"-Label
         rowspan ueber die 7 Slot-Zeilen -->
    <table class="crew">
      <tr>
        <td class="lbl">Fahrer</td>
        <td colspan="2" class="name">${escape(d.fahrer ?? "")}</td>
        <td class="as"></td>
      </tr>
      <tr>
        <td class="lbl">Fahrzeug-Kdt.</td>
        <td colspan="2" class="name">${escape(d.fahrzeugKdt ?? "")}</td>
        <td class="as"></td>
      </tr>
      ${mannschaftPadded
        .map(
          (m, i) => `<tr>
            ${i === 0 ? `<td class="lbl merged" rowspan="7">Mannschaft</td>` : ""}
            <td class="no">${i + 1}</td>
            <td class="name">${m ? escape(m.name) : ""}</td>
            <td class="as">${m?.atemschutzAktiv ? "AS" : ""}</td>
          </tr>`,
        )
        .join("")}
    </table>

    <!-- Tabelle 4: Geraete, Mittel -->
    <table class="geraete">
      <tr>
        <td class="lbl">
          Geräte, Mittel
          <small>Pumpe, Generator,<br/>Seilwinde, Leiter, Lüfter<br/>Ölbindemittel, etc.</small>
        </td>
        <td class="val">${escape(geraeteList)}${d.oelSaecke > 0 ? `\nÖlbindemittel: ${d.oelSaecke} Sack` : ""}</td>
      </tr>
    </table>

    <div class="ft">Näherer Tätigkeitsbericht auf Rückseite</div>
  </div>

  <!-- ═══ SEITE 2 — RUECKSEITE ═══════════════════════════ -->
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

/**
 * Wird derzeit nicht im Layout verwendet (Vordruck hat kein Logo) —
 * bleibt fuer zukuenftige Variante mit Logo-Header verfuegbar.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function renderBrandLogo(): string {
  const dataUrl = getBrandLogoDataUrl();
  if (!dataUrl) return "";
  return `<img src="${dataUrl}" alt="FF Eberstalzell" />`;
}

/** Mapper-Helper fuer pdf.ts: FahrzeugId → Anzeige-Abk. */
export function fahrzeugAbk(fahrzeugId: string): string {
  return FAHRZEUG_LABELS[fahrzeugId] ?? fahrzeugId.toUpperCase();
}
