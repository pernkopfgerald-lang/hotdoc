/**
 * Fahrzeugbericht-PDF im Stil der Papier-Vorlage der FF Eberstalzell.
 *
 * Layout (Vorderseite):
 *   Header: "FF Eberstalzell" + "Fahrzeugbericht"-Titel
 *   Block 1: Einsatzort · Datum · Uhrzeit von · Uhrzeit bis
 *   Block 2: Fahrzeug (Auswahl-Reihe, aktives angekreuzt) · Kilometer
 *   Block 3: Fahrer · Fahrzeug-Kdt. · Mannschaft 1-7 mit AS-Markierung
 *   Block 4: Geräte, Mittel (mit Hinweis-Beispielen Pumpe, Generator …)
 *   Footer: "Näherer Tätigkeitsbericht auf Rückseite"
 *
 * Layout (Rückseite, Seite 2):
 *   Header: Fahrzeug-Funkrufname + Einsatzort + Datum
 *   Tätigkeitsbericht (Freitext, mehrzeilig)
 *   Einsatzchronik-Tabelle (gefiltert oder gesamt — sortiert nach Zeit)
 *
 * Ausgefuellte Werte werden in dunkelblau (#1e3a8a) gerendert um sie
 * visuell vom Papier-Raster zu trennen — wie schon im Haupt-Template.
 */

import { getBrandLogoDataUrl } from "./brand.js";

const FILLED = "#1e3a8a";

const FAHRZEUG_LABELS: Record<string, string> = {
  kdo: "KDO",
  "tlf-a-4000": "TANK",
  "lfa-b": "LFB-A2",
  mtf: "MTF",
  zentrale: "FLORIAN",
};
const FAHRZEUGE_AUSWAHL = ["KDO", "TANK", "LFB-A2", "MTF", "HR-Anhänger"] as const;

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

  // Mannschafts-Liste auf 7 Slots auffuellen
  const mannschaftPadded: Array<{
    name: string;
    rang?: string;
    atemschutzAktiv: boolean;
    atemschutzDauerMin?: number;
  } | null> = [];
  for (let i = 0; i < 7; i++) {
    mannschaftPadded.push(d.mannschaft[i] ?? null);
  }

  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Fahrzeugbericht ${escape(d.abk)} · ${escape(d.einsatzId)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 14mm 16mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 10pt;
      line-height: 1.35;
    }
    .page {
      max-width: 182mm;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }

    .hd {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 4mm;
      border-bottom: 1.2pt solid #000;
      margin-bottom: 5mm;
    }
    .hd-l {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16pt;
      letter-spacing: -0.02em;
    }
    .hd-l img { height: 14mm; width: auto; }
    .hd-r {
      font-weight: 700;
      font-size: 22pt;
      letter-spacing: -0.02em;
    }

    table.bx {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4mm;
    }
    table.bx td {
      border: 0.6pt solid #000;
      padding: 3pt 6pt;
      vertical-align: middle;
    }
    table.bx td.lbl {
      width: 32mm;
      font-weight: 700;
      background: #fff;
      font-size: 10.5pt;
    }
    table.bx td.val {
      font-size: 11pt;
      color: ${FILLED};
      font-weight: 600;
      min-height: 7mm;
    }
    table.bx td.val.empty { color: #000; font-weight: 400; }

    .cb {
      display: inline-block;
      width: 4.5mm; height: 4.5mm;
      border: 0.8pt solid #000;
      margin-right: 2pt;
      vertical-align: -1.5pt;
      text-align: center;
      line-height: 4mm;
      font-size: 9pt;
    }
    .cb.on { background: ${FILLED}; color: #fff; font-weight: 700; }

    .fzg-row td { padding: 4pt 6pt; font-size: 10.5pt; font-weight: 600; }
    .fzg-row .chk { display: inline-flex; align-items: center; margin-right: 6pt; }

    /* Mannschaft */
    table.crew { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
    table.crew td { border: 0.6pt solid #000; padding: 3pt 6pt; vertical-align: middle; }
    table.crew td.lbl { width: 32mm; font-weight: 700; font-size: 10.5pt; }
    table.crew td.lbl.merged { vertical-align: top; padding-top: 4pt; }
    table.crew td.no { width: 8mm; font-weight: 700; text-align: center; font-size: 11pt; }
    table.crew td.name {
      font-size: 11pt;
      color: ${FILLED};
      font-weight: 600;
      min-height: 6mm;
    }
    table.crew td.name.empty { color: #000; font-weight: 400; min-height: 6mm; }
    table.crew td.as {
      width: 18mm;
      text-align: center;
      font-weight: 700;
      font-size: 11pt;
    }
    table.crew td.as .yes {
      display: inline-block;
      padding: 1pt 5pt;
      border-radius: 3pt;
      background: ${FILLED};
      color: #fff;
      font-size: 9pt;
      letter-spacing: 0.04em;
    }

    /* Geraete */
    .geraete {
      display: grid;
      grid-template-columns: 32mm 1fr;
      border: 0.6pt solid #000;
    }
    .geraete .lbl {
      padding: 4pt 6pt;
      font-weight: 700;
      font-size: 10.5pt;
      border-right: 0.6pt solid #000;
    }
    .geraete .lbl small {
      display: block;
      font-weight: 400;
      font-size: 8.5pt;
      color: #555;
      margin-top: 3pt;
      line-height: 1.4;
    }
    .geraete .val {
      padding: 4pt 6pt;
      font-size: 10.5pt;
      color: ${FILLED};
      font-weight: 500;
      min-height: 26mm;
    }
    .geraete .val.empty { color: #000; font-weight: 400; }

    .ft {
      margin-top: 4mm;
      padding: 3pt 8pt;
      background: #000;
      color: #fff;
      font-weight: 700;
      font-size: 10pt;
      text-align: right;
      letter-spacing: 0.01em;
    }

    /* Seite 2 — Rueckseite */
    .p2-head {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
      padding-bottom: 3mm;
      border-bottom: 0.8pt solid #000;
      margin-bottom: 5mm;
      font-size: 10pt;
    }
    .p2-head .lbl {
      font-family: "Courier New", monospace;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 2pt;
    }
    .p2-head .v {
      font-size: 11pt;
      font-weight: 600;
      color: ${FILLED};
    }

    h2.section {
      font-size: 12pt;
      font-weight: 700;
      margin: 0 0 3mm;
      padding-bottom: 2pt;
      border-bottom: 1pt solid #000;
      letter-spacing: -0.01em;
    }
    .freitext {
      min-height: 70mm;
      padding: 5pt 7pt;
      border: 0.6pt solid #000;
      white-space: pre-wrap;
      color: ${FILLED};
      font-size: 10.5pt;
      line-height: 1.55;
      margin-bottom: 6mm;
    }
    .freitext:empty::before {
      content: "—";
      color: #999;
    }

    table.chronik { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    table.chronik td {
      border-bottom: 0.4pt solid #ccc;
      padding: 2.5pt 5pt;
      vertical-align: top;
    }
    table.chronik thead td {
      border-bottom: 0.8pt solid #000;
      background: #f0f0f0;
      font-weight: 700;
      font-size: 8.5pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    table.chronik .ts {
      width: 18mm;
      font-family: "Courier New", monospace;
      color: #555;
    }
    table.chronik .src {
      width: 30mm;
      color: ${FILLED};
      font-weight: 600;
    }
    table.chronik .empty {
      text-align: center;
      color: #888;
      font-style: italic;
      padding: 8pt;
    }

    .status-banner {
      padding: 3pt 8pt;
      background: ${FILLED};
      color: #fff;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: inline-block;
      border-radius: 3pt;
      margin-bottom: 3mm;
    }
    .status-banner.in-arbeit {
      background: #d97706;
    }
  </style>
</head>
<body>

  <!-- ═══ SEITE 1 — VORDERSEITE ═══════════════════════════ -->
  <div class="page">
    <div class="hd">
      <div class="hd-l">
        ${renderBrandLogo()}
        <span>FF Eberstalzell</span>
      </div>
      <div class="hd-r">Fahrzeugbericht</div>
    </div>

    ${d.status === "in_arbeit" ? `<span class="status-banner in-arbeit">In Arbeit — noch nicht abgeschlossen</span>` : ""}

    <!-- Block 1: Einsatzort, Datum, Uhrzeit -->
    <table class="bx">
      <tr>
        <td class="lbl">Einsatzort</td>
        <td class="val${d.einsatzort ? "" : " empty"}">${escape(d.einsatzort) || ""}</td>
      </tr>
      <tr>
        <td class="lbl">Datum</td>
        <td class="val${datum ? "" : " empty"}">${escape(datum)}</td>
      </tr>
      <tr>
        <td class="lbl">Uhrzeit von</td>
        <td class="val${vonStr ? "" : " empty"}">${escape(vonStr)}</td>
      </tr>
      <tr>
        <td class="lbl">Uhrzeit bis</td>
        <td class="val${bisStr ? "" : " empty"}">${escape(bisStr)}</td>
      </tr>
    </table>

    <!-- Block 2: Fahrzeug + KM -->
    <table class="bx">
      <tr class="fzg-row">
        <td class="lbl">Fahrzeug</td>
        <td class="val">
          ${FAHRZEUGE_AUSWAHL.map((f) => {
            const isActive =
              f === d.abk ||
              (f === "TANK" && d.fahrzeugId === "tlf-a-4000") ||
              (f === "LFB-A2" && d.fahrzeugId === "lfa-b");
            return `<span class="chk"><span class="cb${isActive ? " on" : ""}">${isActive ? "X" : ""}</span>${f}</span>`;
          }).join(" / ")}
        </td>
      </tr>
      <tr>
        <td class="lbl">Kilometer</td>
        <td class="val${kmStr ? "" : " empty"}">${escape(kmStr)}</td>
      </tr>
    </table>

    <!-- Block 3: Fahrer, Kdt, Mannschaft -->
    <table class="crew">
      <tr>
        <td class="lbl">Fahrer</td>
        <td colspan="2" class="name${d.fahrer ? "" : " empty"}">${escape(d.fahrer ?? "")}</td>
        <td class="as">&nbsp;</td>
      </tr>
      <tr>
        <td class="lbl">Fahrzeug-Kdt.</td>
        <td colspan="2" class="name${d.fahrzeugKdt ? "" : " empty"}">${escape(d.fahrzeugKdt ?? "")}</td>
        <td class="as">&nbsp;</td>
      </tr>
      ${mannschaftPadded
        .map(
          (m, i) => `<tr>
            ${i === 0 ? `<td class="lbl merged" rowspan="7">Mannschaft</td>` : ""}
            <td class="no">${i + 1}</td>
            <td class="name${m ? "" : " empty"}">${m ? escape(m.name) + (m.rang ? ` <span style="font-weight:400;color:#666">· ${escape(m.rang)}</span>` : "") : ""}</td>
            <td class="as">${m?.atemschutzAktiv ? `<span class="yes">AS${m.atemschutzDauerMin ? ` ${m.atemschutzDauerMin}'` : ""}</span>` : `AS`}</td>
          </tr>`,
        )
        .join("")}
    </table>

    <!-- Block 4: Geraete, Mittel -->
    <div class="geraete">
      <div class="lbl">
        Geräte, Mittel
        <small>Pumpe, Generator, Seilwinde, Leiter, Lüfter, Ölbindemittel, etc.</small>
      </div>
      <div class="val${d.geraete.length > 0 ? "" : " empty"}">
        ${d.geraete.length > 0 ? d.geraete.map(escape).join(" · ") : ""}
        ${d.oelSaecke > 0 ? `<div style="margin-top:3pt;font-weight:700">Ölbindemittel: ${d.oelSaecke} Sack</div>` : ""}
      </div>
    </div>

    <div class="ft">Näherer Tätigkeitsbericht auf Rückseite</div>
  </div>

  <!-- ═══ SEITE 2 — RUECKSEITE ═══════════════════════════ -->
  <div class="page">
    <div class="p2-head">
      <div>
        <div class="lbl">Fahrzeug</div>
        <div class="v">${escape(d.abk)} · ${escape(d.funkrufname)}</div>
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

// ─── Helpers (lokal — Hauptbericht-Template hat eigene) ────────────

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
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  } catch {
    return "";
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function renderBrandLogo(): string {
  const dataUrl = getBrandLogoDataUrl();
  if (!dataUrl) return "";
  return `<img src="${dataUrl}" alt="FF Eberstalzell" />`;
}

/** Mapper-Helper fuer pdf.ts: FahrzeugId → Anzeige-Abk. */
export function fahrzeugAbk(fahrzeugId: string): string {
  return FAHRZEUG_LABELS[fahrzeugId] ?? fahrzeugId.toUpperCase();
}
