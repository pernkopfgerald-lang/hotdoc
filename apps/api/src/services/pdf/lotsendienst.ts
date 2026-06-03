/**
 * PDF-Template für Lotsendienste.
 *
 * Use-Case: Schwertransport-Begleitung, Polizei-Beihilfe, Veranstaltungs-
 * Lotsendienst. Im Gegensatz zum Einsatzbericht ist das Wichtigste die
 * **Verrechnungs-Information** — Auftraggeber, Route, KM-Summe, Stunden.
 *
 * Layout: A4 hochkant, eine Seite. Header mit dem offiziellen FF-
 * Eberstalzell-Logo + großem "Lotsendienst"-Schriftzug damit der
 * Empfänger sofort sieht dass das KEIN Brandeinsatz-Bericht ist.
 */

import { escape, pad, formatDate, formatTime, calcDauerMin, renderBrandLogo } from "./_format.js";

export interface LotsendienstDaten {
  einsatzId: string;
  /** Berichts-Nr im Schema T26-007 (Issue 24, Einsatz-Test 2026-06-02). Optional. */
  berichtsNummer?: string;
  /** Quelle des Berichts (z. B. "Lotsendienst manuell"). Optional. */
  einsatzQuelle?: string;
  einsatzort: string;
  alarmierungZeit: string;
  einsatzende?: string;
  auftraggeber: string;
  route?: string;
  verrechenbar: boolean;
  rechnungsadresse?: string;
  mannschaft: Array<{
    name: string;
    rang?: string;
    kdt?: boolean;
    fahrer?: boolean;
  }>;
  fahrzeuge: Array<{
    abk: string;
    funkrufname: string;
    kmGefahren: number;
    zeitVon?: string;
    zeitBis?: string;
  }>;
  taetigkeitsbericht?: string;
  meldungEinsatzleitung?: string;
  bearbeiterName?: string;
  einsatzleiterName?: string;
}

export function renderLotsendienstHtml(d: LotsendienstDaten): string {
  const datum = formatDate(d.alarmierungZeit);
  const start = formatTime(d.alarmierungZeit);
  const ende = d.einsatzende ? formatTime(d.einsatzende) : "—";
  const totalKm = d.fahrzeuge.reduce((sum, f) => sum + f.kmGefahren, 0);
  const dauerMin = d.einsatzende ? calcDauerMin(d.alarmierungZeit, d.einsatzende) : null;
  const dauerStr = dauerMin === null ? "—" : `${Math.floor(dauerMin / 60)}h ${pad(dauerMin % 60)}min`;
  const totalMannschaftStunden =
    dauerMin !== null ? Math.round((d.mannschaft.length * dauerMin) / 60 * 100) / 100 : null;

  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Lotsendienst-Bericht ${escape(d.einsatzId)}</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff;
      color: #0f172a;
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 10pt;
      line-height: 1.35;
    }
    .page { max-width: 182mm; }

    /* Header */
    .hd { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 6mm; }
    .hd-left { display: flex; align-items: center; gap: 14px; }
    .hd-logo { height: 18mm; width: auto; display: block; }
    .hd-title-block { display: flex; flex-direction: column; }
    .hd-title { font-size: 22pt; font-weight: 800; letter-spacing: -0.01em; color: #0f172a; line-height: 1.1; }
    .hd-sub { font-size: 9pt; color: #64748b; margin-top: 1mm; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
    .hd-id { font-family: "Courier New", monospace; font-size: 8pt; color: #64748b; text-align: right; }

    /* Typ-Banner (groß damit der Empfänger sofort sieht: KEIN Brand-Einsatz!) */
    .typ-banner {
      background: linear-gradient(90deg, #D97706 0%, #B45309 100%);
      color: #fff;
      padding: 6mm 8mm;
      border-radius: 3mm;
      margin-bottom: 5mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10mm;
    }
    .typ-banner-label {
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .typ-banner-value {
      font-size: 18pt;
      font-weight: 800;
      letter-spacing: -0.01em;
      margin-top: 1mm;
    }
    .typ-banner-rechnung {
      text-align: right;
      font-size: 9pt;
    }
    .typ-banner-rechnung strong {
      display: block;
      font-size: 13pt;
      font-weight: 800;
    }

    /* Sektionen */
    .sec {
      border: 1px solid #cbd5e1;
      border-radius: 2mm;
      padding: 4mm 5mm;
      margin-bottom: 4mm;
    }
    .sec-title {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 2mm;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 1.5mm;
    }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
    .row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
    .row4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4mm; }
    .lbl { font-size: 8pt; font-weight: 700; color: #64748b; letter-spacing: 0.06em; text-transform: uppercase; }
    .val { font-size: 11pt; font-weight: 600; color: #0f172a; margin-top: 0.6mm; }
    .val-big { font-size: 13pt; font-weight: 700; color: #0f172a; margin-top: 0.6mm; }
    .val-mono { font-family: "Courier New", monospace; font-variant-numeric: tabular-nums; }

    /* Tabelle */
    table.mannschaft, table.fahrzeuge {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
    }
    table.mannschaft th, table.mannschaft td,
    table.fahrzeuge th, table.fahrzeuge td {
      padding: 1.5mm 2mm;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
    }
    table.mannschaft th, table.fahrzeuge th {
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #64748b;
      border-bottom: 1.5px solid #94a3b8;
      background: #f8fafc;
    }
    .fz-abk {
      display: inline-block;
      padding: 0.4mm 2mm;
      background: #fed7aa;
      color: #92400e;
      border-radius: 3pt;
      font-family: "Courier New", monospace;
      font-weight: 700;
      font-size: 8pt;
      letter-spacing: 0.08em;
    }
    .num { font-family: "Courier New", monospace; font-variant-numeric: tabular-nums; text-align: right; }

    .summe-row {
      background: #fef3c7;
      font-weight: 800;
    }
    .summe-row td {
      border-top: 1.5px solid #d97706;
      padding-top: 2mm;
      padding-bottom: 2mm;
    }

    .freitext {
      min-height: 16mm;
      padding: 3mm;
      border: 1px solid #e2e8f0;
      border-radius: 2mm;
      background: #f8fafc;
      font-size: 9.5pt;
      white-space: pre-wrap;
      line-height: 1.5;
    }

    /* Unterschriften */
    .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12mm; margin-top: 8mm; }
    .sig-box { border-top: 1px solid #0f172a; padding-top: 1.5mm; font-size: 8pt; color: #64748b; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; min-height: 18mm; }

    /* Footer */
    .ft {
      margin-top: 6mm;
      padding-top: 3mm;
      border-top: 1px solid #cbd5e1;
      font-size: 7pt;
      color: #94a3b8;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-family: "Courier New", monospace;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
<div class="page">

  <div class="hd">
    <div class="hd-left">
      ${renderBrandLogo()}
      <div class="hd-title-block">
        <div class="hd-title">Lotsendienst</div>
        <div class="hd-sub">FF Eberstalzell · Bericht für Verrechnung</div>
      </div>
    </div>
    <div class="hd-id" style="text-align:right">
      ${
        d.berichtsNummer
          ? `<div style="font-family:Arial,sans-serif;font-size:11pt;font-weight:700;color:#0f172a;margin-bottom:1mm">Berichts-Nr ${escape(d.berichtsNummer)}</div>`
          : ""
      }
      <div>${escape(d.einsatzId)}${d.einsatzQuelle ? ` · ${escape(d.einsatzQuelle)}` : ""}</div>
    </div>
  </div>

  <div class="typ-banner">
    <div>
      <div class="typ-banner-label">Auftraggeber</div>
      <div class="typ-banner-value">${escape(d.auftraggeber)}</div>
    </div>
    <div class="typ-banner-rechnung">
      <div class="typ-banner-label">Verrechnung</div>
      <strong>${d.verrechenbar ? "VERRECHENBAR" : "Keine Verrechnung"}</strong>
    </div>
  </div>

  <div class="sec">
    <div class="sec-title">Stammdaten</div>
    <div class="row4">
      <div>
        <div class="lbl">Datum</div>
        <div class="val val-mono">${datum}</div>
      </div>
      <div>
        <div class="lbl">Beginn</div>
        <div class="val val-mono">${start}</div>
      </div>
      <div>
        <div class="lbl">Ende</div>
        <div class="val val-mono">${ende}</div>
      </div>
      <div>
        <div class="lbl">Dauer</div>
        <div class="val val-mono">${dauerStr}</div>
      </div>
    </div>
    <div class="row2" style="margin-top: 3mm">
      <div>
        <div class="lbl">Ort / Treffpunkt</div>
        <div class="val">${escape(d.einsatzort)}</div>
      </div>
      ${d.rechnungsadresse
        ? `<div>
             <div class="lbl">Rechnungsadresse</div>
             <div class="val">${escape(d.rechnungsadresse)}</div>
           </div>`
        : ""}
    </div>
    ${d.route
      ? `<div style="margin-top:3mm">
           <div class="lbl">Route / Strecke</div>
           <div class="val" style="white-space:pre-wrap">${escape(d.route)}</div>
         </div>`
      : ""}
  </div>

  <div class="sec">
    <div class="sec-title">Fahrzeuge + KM</div>
    <table class="fahrzeuge">
      <thead>
        <tr>
          <th>Fahrzeug</th>
          <th>Funkrufname</th>
          <th>Von</th>
          <th>Bis</th>
          <th class="num">KM</th>
        </tr>
      </thead>
      <tbody>
        ${d.fahrzeuge.length === 0
          ? `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:4mm">— keine Fahrzeuge erfasst —</td></tr>`
          : d.fahrzeuge
              .map(
                (f) => `<tr>
            <td><span class="fz-abk">${escape(f.abk)}</span></td>
            <td>${escape(f.funkrufname)}</td>
            <td class="num">${f.zeitVon ? formatTime(f.zeitVon) : "—"}</td>
            <td class="num">${f.zeitBis ? formatTime(f.zeitBis) : "—"}</td>
            <td class="num">${formatKm(f.kmGefahren)}</td>
          </tr>`,
              )
              .join("")}
        <tr class="summe-row">
          <td colspan="4"><strong>Summe KM (für Verrechnung)</strong></td>
          <td class="num"><strong>${formatKm(totalKm)} km</strong></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="sec">
    <div class="sec-title">Mannschaft (${d.mannschaft.length} Pers.${totalMannschaftStunden !== null ? ` · ${totalMannschaftStunden}h gesamt` : ""})</div>
    <table class="mannschaft">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Rang</th>
          <th>Funktion</th>
        </tr>
      </thead>
      <tbody>
        ${d.mannschaft.length === 0
          ? `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:4mm">— keine Mannschaft erfasst —</td></tr>`
          : d.mannschaft
              .map(
                (m, i) => `<tr>
            <td class="num">${i + 1}</td>
            <td>${escape(m.name)}</td>
            <td>${escape(m.rang ?? "")}</td>
            <td>${m.kdt ? "Kdt." : m.fahrer ? "Fahrer" : ""}</td>
          </tr>`,
              )
              .join("")}
      </tbody>
    </table>
  </div>

  ${d.taetigkeitsbericht || d.meldungEinsatzleitung
    ? `<div class="sec">
        <div class="sec-title">Tätigkeitsbericht</div>
        <div class="freitext">${escape(d.taetigkeitsbericht ?? d.meldungEinsatzleitung ?? "")}</div>
      </div>`
    : ""}

  <div class="sig-row">
    <div class="sig-box">${escape(d.einsatzleiterName ?? "")}\n<br/>Einsatzleiter · Unterschrift</div>
    <div class="sig-box">${escape(d.bearbeiterName ?? "")}\n<br/>Bearbeiter · Unterschrift</div>
  </div>

  <div class="ft">
    <span>HotDoc · FF Eberstalzell · Lotsendienst-Bericht</span>
    <span>${new Date().toLocaleString("de-AT", { timeZone: "Europe/Vienna" })}</span>
  </div>

</div>
</body>
</html>`;
}

function formatKm(km: number): string {
  return km.toFixed(1).replace(".", ",");
}
