/**
 * HTML-Vorlage für den Einsatzbericht-PDF.
 *
 * Layout: A4 hochkant, eng am Papier-Original der FF Eberstalzell
 * ("Einsatzbericht 2025 NEU.pdf"). Wird in Puppeteer mit
 * page.setContent geladen und auf einer Seite gedruckt.
 *
 * Quelle für die Layout-Tabelle: das eingescannte Formular zeigt:
 *  - Header mit FF-Wappen + "Einsatzbericht"-Schriftzug
 *  - Einsatzort / Datum-Uhrzeit
 *  - Pflichtbereich / Einsatzzone / Alarmiert-durch Checkbox-Reihen
 *  - Fahrzeug-Checkbox-Reihe (KDO/TLF/LFA-B/MTF/PKW-Anhänger/HR-Anhänger/Stapler)
 *  - Einsatzart-Matrix (28 Checkboxen + "Andere Einsätze")
 *  - Lage unter Kontrolle / Brand AUS / Beteiligte Stellen
 *  - Alarmstufen 2/3, Sonstige FF
 *  - Mannschaft (Eingesetzt / Bereitschaft / Sonstige)
 *  - Verrechenbar / Ölbindemittel
 *  - Meldung von der Einsatzleitung (großes Freitextfeld)
 *  - Einsatzleiter / Einsatzende / Bearbeiter / Unterschrift
 *
 * Logo: das **offizielle FF-Eberstalzell-Logo** wird als Base64-Data-URL
 * embedded (über `getBrandLogoDataUrl()`). Keine SVG-Annäherung mehr.
 */

import { getBrandLogoDataUrl } from "./brand.js";

interface BerichtDaten {
  einsatzId: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  einsatzort: string;
  alarmierungZeit: string;
  alarmierungAuthor?: string;
  einsatzTyp: "alarm" | "manuell";
  status: string;
  einsatzende?: string;
  meldungEinsatzleitung?: string;
  oelbindemittelSaecke?: number;
  reaktivierungen?: Array<{ am: string; grund: string }>;
}

const EINSATZARTEN_MATRIX: ReadonlyArray<readonly string[]> = [
  ["Brand Sonstiges", "Brand Gewerbe", "Brand Landwirtschaft", "Brand Wohnhaus"],
  ["BMA", "Brandverdacht", "Brand Kamin", "Brand Abfall"],
  ["Brand KFZ", "Flurbrand", "Brandwache n. Brand", "Personenrettung"],
  ["Überflutung", "Pumparbeiten", "Sturm", "Ölspur"],
  ["Lift", "Tierrettung", "Türöffnung", "Wasserschaden"],
  ["Straßenreinigung", "Lotsendienst", "Kanalspülen", "Brandsicherheitsdienst"],
  ["VU Eingekl. Per.", "VU Aufräumarbeiten", "Höhenrettungseins.", "Bienen / Wespen"],
];
const FAHRZEUGE_REIHE = ["KDO", "TLF-A 4000", "LFA-B", "PKW-Anhänger", "MTF", "HR-Anhänger", "Stapler"] as const;
const ALARMQUELLEN = ["WAS", "Funk", "Telefon", "Bote", "Behörde"] as const;
const BETEILIGTE_STELLEN = ["Polizei", "RK", "BFKDT", "AFKDT", "Gem.", "BH", "GAS", "Ener. AG", "RAG", "Arzt", "Bestatt.", "STM"] as const;
const SONSTIGE_FF = ["OEL", "Kran", "TMB", "SRF", "ASF", "DLK", "GSF", "HEU"] as const;

export function renderHauptberichtHtml(d: BerichtDaten): string {
  const isManuell = d.einsatzTyp === "manuell";
  const datum = formatDate(d.alarmierungZeit);
  const datumZeit = `${datum} · ${formatTime(d.alarmierungZeit)}`;
  const ende = d.einsatzende ? `${formatDate(d.einsatzende)} · ${formatTime(d.einsatzende)}` : "";

  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Einsatzbericht ${escape(d.einsatzId)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      background: #fff;
      color: #000;
      font-family: Arial, "Helvetica Neue", sans-serif;
      font-size: 9pt;
      line-height: 1.25;
    }
    .page { max-width: 186mm; }
    /* ─── Header ─── */
    .hd {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 2mm;
    }
    .hd-l { display: flex; align-items: center; gap: 8px; }
    .hd-logo { height: 16mm; width: auto; display: block; }
    .hd-r { text-align: right; }
    .hd-title { font-size: 24pt; font-weight: 700; line-height: 1; letter-spacing: -0.01em; }

    /* ─── Tabellen-Layout (wie Papier) ─── */
    table.bx { width: 100%; border-collapse: collapse; border: 1pt solid #000; margin-top: 1mm; }
    table.bx td { border: 0.5pt solid #000; vertical-align: top; padding: 2pt 4pt; }
    table.bx .lbl { background: #f0f0f0; font-size: 7.5pt; font-weight: 600; padding: 1.5pt 4pt; }
    table.bx .val { font-size: 9pt; padding: 2pt 4pt 3pt; }
    table.bx .val.big { font-size: 10pt; font-weight: 600; }
    table.bx .small { font-size: 7.5pt; }
    .cb { display: inline-block; }
    .cb-row td { padding: 2pt 4pt; font-size: 8.5pt; }
    .cb-row .cb { margin-right: 3pt; }
    .check-on { font-weight: 700; }

    .matrix td { padding: 1.5pt 4pt; font-size: 8.5pt; }
    .matrix td.col { width: 25%; }

    /* großes Freitext-Feld */
    .freitext {
      min-height: 50mm;
      border: 0.5pt solid #000;
      padding: 4pt;
      font-size: 9pt;
      white-space: pre-wrap;
    }

    /* Audit-Trail */
    .audit {
      margin-top: 2mm;
      padding: 4pt;
      border: 0.5pt solid #d97706;
      border-left-width: 2pt;
      background: #fef3c7;
      font-size: 8pt;
    }

    /* Footer */
    .ft {
      margin-top: 3mm;
      padding-top: 2pt;
      border-top: 1pt solid #000;
      font-size: 7.5pt;
      text-align: center;
      color: #333;
    }
    .ft strong { font-weight: 700; }
  </style>
</head>
<body>
<div class="page">

  <!-- ═══ Header ═══════════════════════════════════════════════ -->
  <div class="hd">
    <div class="hd-l">
      ${renderBrandLogo()}
    </div>
    <div class="hd-r">
      <div class="hd-title">Einsatzbericht</div>
      <div style="font-family:'Courier New',monospace;font-size:9pt;font-weight:600;margin-top:2pt;">
        ${escape(d.einsatzId)} · ${isManuell ? "MANUELL" : "BlaulichtSMS"}
      </div>
    </div>
  </div>

  <!-- ═══ Einsatzort + Datum/Uhrzeit ═══════════════════════════ -->
  <table class="bx">
    <tr>
      <td class="lbl" style="width:64%">Einsatzort</td>
      <td class="lbl">Datum und Uhrzeit</td>
    </tr>
    <tr>
      <td class="val big">${escape(d.einsatzort)}</td>
      <td class="val big">${datumZeit}</td>
    </tr>
  </table>

  <!-- ═══ Pflichtbereich · Einsatzzone · Alarmiert ════════════ -->
  <table class="bx cb-row">
    <tr>
      <td style="width:25%">Pflichtbereich <span class="cb">${box(true)} JA</span> <span class="cb">${box(false)} NEIN</span></td>
      <td style="width:25%">Einsatzzone Eberstalzell <span class="cb">${box(true)} JA</span> <span class="cb">${box(false)} NEIN</span></td>
      <td>Alarmiert durch
        <span class="cb">${box(d.alarmierungAuthor === "BWST")} BWST</span>
        <span class="cb">${box(d.alarmierungAuthor === "LWZ")} LWZ</span>
        <span class="cb">${box(!d.alarmierungAuthor || (d.alarmierungAuthor !== "BWST" && d.alarmierungAuthor !== "LWZ"))} ${escape(d.alarmierungAuthor ?? "Sonstige")}</span>
      </td>
    </tr>
    <tr>
      <td colspan="3">Einsatzauftrag eingelangt über
        ${ALARMQUELLEN.map((q) => `<span class="cb" style="margin-right:8pt">${box(false)} ${q}</span>`).join("")}
      </td>
    </tr>
  </table>

  <!-- ═══ Fahrzeug-Reihe ══════════════════════════════════════ -->
  <table class="bx cb-row">
    <tr><td class="lbl" colspan="7">Eingesetzte Fahrzeuge</td></tr>
    <tr>
      ${FAHRZEUGE_REIHE.map(
        (f) => `<td style="text-align:center"><span class="cb">${box(false)}</span> ${f}</td>`,
      ).join("")}
    </tr>
  </table>

  <!-- ═══ Einsatzart-Matrix ══════════════════════════════════ -->
  <table class="bx matrix">
    <tr><td class="lbl" colspan="4">Einsatzart</td></tr>
    ${EINSATZARTEN_MATRIX.map(
      (row) => `<tr>${row
        .map((art) => {
          const selected = d.einsatzart === art;
          return `<td class="col"><span class="cb">${box(selected)}</span><span class="${selected ? "check-on" : ""}">${art}</span></td>`;
        })
        .join("")}</tr>`,
    ).join("")}
    <tr>
      <td colspan="4">Andere Einsätze: <strong>${escape(d.einsatzartFreitext ?? "")}</strong> · Warn-/Alarmsystem #: ___________</td>
    </tr>
  </table>

  <!-- ═══ Zeitstempel + Beteiligte Stellen ═══════════════════ -->
  <table class="bx" style="margin-top:1mm">
    <tr>
      <td class="lbl" style="width:32%">Lage unter Kontrolle</td>
      <td class="lbl" style="width:32%">Brand AUS</td>
      <td class="lbl">Beteiligte Stellen</td>
    </tr>
    <tr>
      <td class="val">__ : __</td>
      <td class="val">__ : __</td>
      <td class="val" rowspan="3">
        ${BETEILIGTE_STELLEN.map(
          (s, i) =>
            `<span class="cb" style="display:inline-block;width:32%;margin-bottom:1pt">${box(false)} ${s}</span>${(i + 1) % 3 === 0 ? "<br>" : ""}`,
        ).join("")}
      </td>
    </tr>
    <tr>
      <td class="lbl">Alarmstufe 2 · Uhrzeit · Anforderer</td>
      <td class="val">__ : __ · ___________</td>
    </tr>
    <tr>
      <td class="lbl">Alarmstufe 3 · Uhrzeit · Anforderer</td>
      <td class="val">__ : __ · ___________</td>
    </tr>
  </table>

  <!-- ═══ Sonstige FF · Mannschaft · Verrechenbar · Öl ═══════ -->
  <table class="bx">
    <tr>
      <td class="lbl" colspan="2">Sonstige anwesende Feuerwehren</td>
      <td class="lbl">Mannschaft</td>
      <td class="lbl">Verrechenbar / Öl</td>
    </tr>
    <tr>
      <td class="val" colspan="2" style="vertical-align:top">
        ${SONSTIGE_FF.map(
          (f, i) =>
            `<span class="cb" style="display:inline-block;width:23%;margin-bottom:1pt">${box(false)} ${f}</span>${(i + 1) % 4 === 0 ? "<br>" : ""}`,
        ).join("")}
      </td>
      <td class="val" style="vertical-align:top">
        Eingesetzt: ____ Personen<br>
        Bereitschaft: ____<br>
        Sonstige: ____<br>
        <strong style="font-size:8pt">Aggregation aus Fahrzeugberichten</strong>
      </td>
      <td class="val" style="vertical-align:top">
        <span class="cb">${box(false)} JA</span> · <span class="cb">${box(false)} NEIN</span><br>
        Ölbindemittel ${
          d.oelbindemittelSaecke
            ? `<strong>${box(true)} ${d.oelbindemittelSaecke} Sack — VERRECHENBAR</strong>`
            : `${box(false)} _____ Sack`
        }
      </td>
    </tr>
  </table>

  <!-- ═══ Meldung von der Einsatzleitung ═════════════════════ -->
  <table class="bx">
    <tr><td class="lbl">Meldung von der Einsatzleitung</td></tr>
    <tr><td><div class="freitext">${escape(d.meldungEinsatzleitung ?? "")}</div></td></tr>
  </table>

  <!-- ═══ Reaktivierungs-Audit (FR-14) ═══════════════════════ -->
  ${
    d.reaktivierungen && d.reaktivierungen.length > 0
      ? `<div class="audit">
           <strong>Reaktivierungs-Audit-Trail:</strong><br>
           ${d.reaktivierungen
             .map((r) => `• ${formatDateTime(r.am)} · ${escape(r.grund)}`)
             .join("<br>")}
         </div>`
      : ""
  }

  <!-- ═══ Einsatzleiter / Bearbeiter / Unterschriften ════════ -->
  <table class="bx" style="margin-top:1mm">
    <tr>
      <td class="lbl" style="width:50%">Einsatzleiter</td>
      <td class="lbl">Einsatzende</td>
    </tr>
    <tr>
      <td class="val" style="height:10mm;border-top:0.5pt dashed #888"></td>
      <td class="val" style="height:10mm;border-top:0.5pt dashed #888">${ende}</td>
    </tr>
    <tr>
      <td class="lbl">Bearbeiter</td>
      <td class="lbl">Unterschrift</td>
    </tr>
    <tr>
      <td class="val" style="height:10mm;border-top:0.5pt dashed #888"></td>
      <td class="val" style="height:10mm;border-top:0.5pt dashed #888"></td>
    </tr>
  </table>

  <div class="ft">
    <strong>Fahrzeugberichte anhängen nicht vergessen</strong> · Reserve-Mannschaft auf der Rückseite anführen
    &nbsp;·&nbsp; HotDoc · generiert ${formatDateTime(new Date().toISOString())}
  </div>

</div>
</body>
</html>`;
}

export function renderSpickzettelHtml(d: BerichtDaten): string {
  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>syBOS-Spickzettel ${escape(d.einsatzId)}</title>
  <style>
    @page { size: A4 portrait; margin: 16mm; }
    body { font-family: "Courier New", monospace; font-size: 11pt; color: #000; margin: 0; padding: 0; }
    h1 { font-family: Arial, sans-serif; font-size: 18pt; margin: 0 0 4mm; }
    .sub { font-family: Arial, sans-serif; font-size: 10pt; color: #555; margin-bottom: 8mm; }
    ol { padding-left: 18pt; }
    li { margin: 8pt 0; line-height: 1.5; }
    .val { display: inline-block; background: #fef3c7; padding: 1pt 8pt; border: 0.5pt solid #f59e0b; font-weight: 700; }
    .nr { font-family: Arial, sans-serif; font-weight: 700; color: #C8102E; }
  </style>
</head>
<body>
  <h1>syBOS-Spickzettel</h1>
  <div class="sub">
    Bericht <span class="nr">${escape(d.einsatzId)}</span> ·
    bearbeite diesen Einsatz in syBOS in folgender Reihenfolge:
  </div>
  <ol>
    <li>Einsatzort: <span class="val">${escape(d.einsatzort)}</span></li>
    <li>Datum / Uhrzeit: <span class="val">${formatDateTime(d.alarmierungZeit)}</span></li>
    <li>Einsatzart: <span class="val">${escape(d.einsatzart ?? d.einsatzartFreitext ?? "—")}</span></li>
    ${d.alarmierungAuthor ? `<li>Alarmierungsquelle: <span class="val">${escape(d.alarmierungAuthor)}</span></li>` : ""}
    ${d.einsatzende ? `<li>Einsatzende: <span class="val">${formatDateTime(d.einsatzende)}</span></li>` : ""}
    ${d.oelbindemittelSaecke ? `<li>Ölbindemittel: <span class="val">${d.oelbindemittelSaecke} Säcke (VERRECHENBAR)</span></li>` : ""}
    <li>Bericht-PDF als Anhang an den syBOS-Eintrag hängen.</li>
  </ol>
  <p style="margin-top:18pt;font-size:9pt;color:#888;">
    HotDoc · generiert ${formatDateTime(new Date().toISOString())}
  </p>
</body>
</html>`;
}

// ─── Helpers ────────────────────────────────────────────────────────

function box(checked: boolean): string {
  return checked ? "☒" : "☐";
}

function escape(s: string): string {
  return s
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
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return `${formatDate(iso)} ${formatTime(iso)}`;
  } catch {
    return iso;
  }
}

/**
 * Rendert das offizielle FF-Eberstalzell-Logo als img-Tag mit Base64-
 * Data-URL. Bei fehlender Logo-Datei rendern wir leer — niemals eine
 * Fake-Annäherung.
 */
function renderBrandLogo(): string {
  const dataUrl = getBrandLogoDataUrl();
  if (!dataUrl) return "";
  return `<img class="hd-logo" src="${dataUrl}" alt="FF Eberstalzell" />`;
}
