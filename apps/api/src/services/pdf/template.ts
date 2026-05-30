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

export interface BerichtDaten {
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
  // Florianstation-Felder (frueher hartkodiert leer)
  pflichtbereich?: boolean | null;
  einsatzzoneEzell?: boolean | null;
  ueberOertlicheHilfe?: boolean | null;
  einsatzauftragVia?: "WAS" | "Funk" | "Telefon" | "Bote" | "Behoerde" | null;
  anrufer?: string;
  anruferTel?: string;
  zeitmarken?: {
    lageUnterKontrolle?: string;
    brandAus?: string;
    alst2?: { zeit?: string; anforderer?: string };
    alst3?: { zeit?: string; anforderer?: string };
  };
  beteiligteStellen?: string[];
  sonstigeAnwesendeFF?: string[];
  sonstigeFreitext?: string;
  verrechenbar?: boolean;
  /** Aggregation: Personen-Anzahl, AS-Trupps etc. */
  mannschaft?: {
    eingesetzt: number;
    bereitschaft: number;
    sonstige: number;
    atemschutzTrupps: number;
  };
  /** Welche Fahrzeuge sind im Einsatz (aus Fahrzeugberichten). */
  eingesetzteFahrzeuge?: Array<{ abk: string; funkrufname: string; kmGefahren: number }>;
  /** Komplette Einsatz-Chronik fuer Anhang-Seite. */
  chronik?: Array<{
    zeitstempel: string;
    funkrufname: string;
    text: string;
    source: string;
  }>;
  /** Fahrzeug-Berichte fuer Anhang-Seiten. */
  fahrzeugberichte?: Array<{
    fahrzeugId: string;
    funkrufname: string;
    abk: string;
    status: "in_arbeit" | "abgeschlossen";
    kmGefahren: number;
    fahrer?: string;
    fahrzeugKdt?: string;
    mannschaft: Array<{ name: string; atemschutzAktiv: boolean; atemschutzDauerMin?: number }>;
    geraete: string[];
    oelSaecke: number;
    taetigkeitsbericht: string;
  }>;
  /** Wenn beim Abschluss noch Fahrzeugberichte offen waren — Hinweis-Banner. */
  abschlussOverrideHinweis?: string;
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
const ALARMQUELLEN = ["WAS", "Funk", "Telefon", "Bote", "Behoerde"] as const;

export function renderHauptberichtHtml(d: BerichtDaten): string {
  const isManuell = d.einsatzTyp === "manuell";
  const datum = formatDate(d.alarmierungZeit);
  const datumZeit = `${datum} · ${formatTime(d.alarmierungZeit)}`;
  const ende = d.einsatzende ? `${formatDate(d.einsatzende)} · ${formatTime(d.einsatzende)}` : "";

  // Brand-konsistente Farbe fuer ausgefuellte Werte (dunkelblau) — matcht
  // die Tablet-UX wo eingegebene Felder ebenfalls dunkelblau dargestellt
  // werden. Trennt User-Daten visuell vom Papier-Raster.
  const FILLED = "#1e3a8a";

  // Hilfsfunktion: Wert dunkelblau rendern wenn vorhanden, sonst Leerzeile
  const v = (val: string | undefined | null, fallback = "—"): string =>
    val && val.trim()
      ? `<span style="color:${FILLED};font-weight:600">${escape(val)}</span>`
      : fallback;
  const vTime = (val: string | undefined): string =>
    val ? `<span style="color:${FILLED};font-weight:600">${escape(formatTime(val))}</span>` : "__ : __";
  const triBox = (val: boolean | null | undefined, label: string): string => {
    if (val === true) return `${boxFilled(true)} <strong style="color:${FILLED}">${label}</strong>`;
    if (val === false) return `${boxFilled(false)} ${label}`;
    return `${box(false)} ${label}`;
  };

  const eingesetzeFzgSet = new Set(
    (d.eingesetzteFahrzeuge ?? []).map((f) => f.abk.toUpperCase()),
  );
  const FAHRZEUGE_REIHE = ["KDO", "TANK", "LFA-B", "PKW-Anhänger", "MTF", "HR-Anhänger", "Stapler"] as const;

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
    .page { max-width: 186mm; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
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
    .hd-sub-title { font-size: 18pt; font-weight: 700; line-height: 1; color: ${FILLED}; }

    table.bx { width: 100%; border-collapse: collapse; border: 1pt solid #000; margin-top: 1mm; }
    table.bx td { border: 0.5pt solid #000; vertical-align: top; padding: 2pt 4pt; }
    table.bx .lbl { background: #f0f0f0; font-size: 7.5pt; font-weight: 600; padding: 1.5pt 4pt; }
    table.bx .val { font-size: 9pt; padding: 2pt 4pt 3pt; }
    table.bx .val.big { font-size: 10pt; font-weight: 600; color: ${FILLED}; }
    .cb { display: inline-block; }
    .cb-row td { padding: 2pt 4pt; font-size: 8.5pt; }
    .cb-row .cb { margin-right: 3pt; }
    .check-on { font-weight: 700; color: ${FILLED}; }
    .matrix td { padding: 1.5pt 4pt; font-size: 8.5pt; }
    .matrix td.col { width: 25%; }
    .freitext {
      min-height: 50mm;
      border: 0.5pt solid #000;
      padding: 4pt;
      font-size: 9pt;
      white-space: pre-wrap;
      color: ${FILLED};
      font-weight: 500;
    }
    .audit {
      margin-top: 2mm;
      padding: 4pt;
      border: 0.5pt solid #d97706;
      border-left-width: 2pt;
      background: #fef3c7;
      font-size: 8pt;
    }
    .override-warn {
      margin: 2mm 0;
      padding: 6pt 8pt;
      border: 1pt solid #b91c1c;
      border-left-width: 3pt;
      background: #fee2e2;
      font-size: 9pt;
      color: #7f1d1d;
      font-weight: 600;
    }
    .ft {
      margin-top: 3mm;
      padding-top: 2pt;
      border-top: 1pt solid #000;
      font-size: 7.5pt;
      text-align: center;
      color: #333;
    }
    .ft strong { font-weight: 700; }
    /* Anhang */
    .att-h { font-size: 14pt; font-weight: 700; margin: 0 0 4mm; color: ${FILLED}; }
    .att-sub { font-size: 9pt; color: #555; margin-bottom: 4mm; }
    .chronik-tbl, .fzg-tbl { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
    .chronik-tbl td { border-bottom: 0.5pt solid #ddd; padding: 3pt 4pt; vertical-align: top; }
    .chronik-tbl .ts { width: 22mm; font-family: "Courier New", monospace; color: #555; }
    .chronik-tbl .src { width: 28mm; color: ${FILLED}; font-weight: 600; }
    .fzg-detail { margin-bottom: 6mm; padding: 4pt; border: 0.5pt solid #888; }
    .fzg-detail h3 { font-size: 11pt; margin: 0 0 2mm; color: ${FILLED}; }
    .fzg-detail .row { display: flex; gap: 6mm; font-size: 8.5pt; margin-bottom: 1.5mm; }
    .fzg-detail .row b { color: #555; font-weight: 600; margin-right: 4pt; }
    .fzg-detail ul { margin: 1mm 0 2mm; padding-left: 14pt; font-size: 8.5pt; }
    .fzg-detail li { color: ${FILLED}; }
  </style>
</head>
<body>
<div class="page">

  ${d.abschlussOverrideHinweis ? `<div class="override-warn">⚠️ ABSCHLUSS-HINWEIS: ${escape(d.abschlussOverrideHinweis)}</div>` : ""}

  <div class="hd">
    <div class="hd-l">${renderBrandLogo()}</div>
    <div class="hd-r">
      <div class="hd-title">Einsatzbericht</div>
      <div style="font-family:'Courier New',monospace;font-size:9pt;font-weight:600;margin-top:2pt;">
        ${escape(d.einsatzId)} · ${isManuell ? "MANUELL" : "BlaulichtSMS"}
      </div>
    </div>
  </div>

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

  <table class="bx cb-row">
    <tr>
      <td style="width:25%">Pflichtbereich
        <span class="cb">${triBox(d.pflichtbereich === true || null, "JA")}</span>
        <span class="cb">${triBox(d.pflichtbereich === false || null, "NEIN")}</span>
      </td>
      <td style="width:25%">Einsatzzone Eberstalzell
        <span class="cb">${triBox(d.einsatzzoneEzell === true || null, "JA")}</span>
        <span class="cb">${triBox(d.einsatzzoneEzell === false || null, "NEIN")}</span>
      </td>
      <td>Alarmiert durch
        <span class="cb">${boxFilled(d.alarmierungAuthor === "BWST")} BWST</span>
        <span class="cb">${boxFilled(d.alarmierungAuthor === "LWZ")} LWZ</span>
        ${d.alarmierungAuthor && d.alarmierungAuthor !== "BWST" && d.alarmierungAuthor !== "LWZ" ? `<span class="cb">${boxFilled(true)} <strong style="color:${FILLED}">${escape(d.alarmierungAuthor)}</strong></span>` : ""}
      </td>
    </tr>
    <tr>
      <td colspan="3">Einsatzauftrag eingelangt über
        ${ALARMQUELLEN.map(
          (q) =>
            `<span class="cb" style="margin-right:8pt">${boxFilled((d.einsatzauftragVia ?? "") === q)} ${q}</span>`,
        ).join("")}
        ${d.anrufer ? `· <span style="margin-left:6pt">Anrufer: ${v(d.anrufer)}</span>` : ""}
        ${d.anruferTel ? `· Tel: ${v(d.anruferTel)}` : ""}
      </td>
    </tr>
  </table>

  <table class="bx cb-row">
    <tr><td class="lbl" colspan="7">Eingesetzte Fahrzeuge</td></tr>
    <tr>
      ${FAHRZEUGE_REIHE.map(
        (f) => {
          const sel = eingesetzeFzgSet.has(f.toUpperCase());
          return `<td style="text-align:center;${sel ? `color:${FILLED};font-weight:700;` : ""}">${boxFilled(sel)} ${f}</td>`;
        },
      ).join("")}
    </tr>
  </table>

  <table class="bx matrix">
    <tr><td class="lbl" colspan="4">Einsatzart</td></tr>
    ${EINSATZARTEN_MATRIX.map(
      (row) => `<tr>${row
        .map((art) => {
          const selected = d.einsatzart === art;
          return `<td class="col"><span class="cb">${boxFilled(selected)}</span> <span class="${selected ? "check-on" : ""}">${art}</span></td>`;
        })
        .join("")}</tr>`,
    ).join("")}
    <tr>
      <td colspan="4">Andere Einsätze: ${v(d.einsatzartFreitext)}</td>
    </tr>
  </table>

  <table class="bx" style="margin-top:1mm">
    <tr>
      <td class="lbl" style="width:32%">Lage unter Kontrolle</td>
      <td class="lbl" style="width:32%">Brand AUS</td>
      <td class="lbl">Beteiligte Stellen</td>
    </tr>
    <tr>
      <td class="val">${vTime(d.zeitmarken?.lageUnterKontrolle)}</td>
      <td class="val">${vTime(d.zeitmarken?.brandAus)}</td>
      <td class="val" rowspan="3">
        ${
          d.beteiligteStellen && d.beteiligteStellen.length > 0
            ? d.beteiligteStellen
                .map((s) => `<span style="color:${FILLED};font-weight:600">${boxFilled(true)} ${escape(s)}</span><br>`)
                .join("")
            : `<span style="color:#888">keine angegeben</span>`
        }
      </td>
    </tr>
    <tr>
      <td class="lbl">Alarmstufe 2 · Uhrzeit · Anforderer</td>
      <td class="val">${vTime(d.zeitmarken?.alst2?.zeit)} · ${v(d.zeitmarken?.alst2?.anforderer)}</td>
    </tr>
    <tr>
      <td class="lbl">Alarmstufe 3 · Uhrzeit · Anforderer</td>
      <td class="val">${vTime(d.zeitmarken?.alst3?.zeit)} · ${v(d.zeitmarken?.alst3?.anforderer)}</td>
    </tr>
  </table>

  <table class="bx">
    <tr>
      <td class="lbl" colspan="2">Sonstige anwesende Feuerwehren</td>
      <td class="lbl">Mannschaft</td>
      <td class="lbl">Verrechenbar / Öl</td>
    </tr>
    <tr>
      <td class="val" colspan="2" style="vertical-align:top">
        ${
          d.sonstigeAnwesendeFF && d.sonstigeAnwesendeFF.length > 0
            ? d.sonstigeAnwesendeFF
                .map((f) => `<span style="color:${FILLED};font-weight:600">${boxFilled(true)} ${escape(f)}</span><br>`)
                .join("")
            : `<span style="color:#888">keine</span>`
        }
        ${d.sonstigeFreitext ? `<div style="margin-top:2pt;color:${FILLED}">+ ${escape(d.sonstigeFreitext)}</div>` : ""}
      </td>
      <td class="val" style="vertical-align:top">
        Eingesetzt: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.eingesetzt ?? 0}</span> Personen<br>
        Bereitschaft: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.bereitschaft ?? 0}</span><br>
        Sonstige: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.sonstige ?? 0}</span><br>
        AS-Trupps: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.atemschutzTrupps ?? 0}</span>
      </td>
      <td class="val" style="vertical-align:top">
        Verrechenbar: <span class="cb">${boxFilled(d.verrechenbar === true)} JA</span> · <span class="cb">${boxFilled(d.verrechenbar === false)} NEIN</span><br>
        Ölbindemittel: ${
          d.oelbindemittelSaecke && d.oelbindemittelSaecke > 0
            ? `<strong style="color:${FILLED}">${boxFilled(true)} ${d.oelbindemittelSaecke} Sack</strong>`
            : `${boxFilled(false)} 0 Sack`
        }
      </td>
    </tr>
  </table>

  <table class="bx">
    <tr><td class="lbl">Meldung von der Einsatzleitung</td></tr>
    <tr><td><div class="freitext">${escape(d.meldungEinsatzleitung ?? "")}</div></td></tr>
  </table>

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

  <table class="bx" style="margin-top:1mm">
    <tr>
      <td class="lbl" style="width:50%">Einsatzleiter</td>
      <td class="lbl">Einsatzende</td>
    </tr>
    <tr>
      <td class="val" style="height:10mm;border-top:0.5pt dashed #888"></td>
      <td class="val" style="height:10mm;border-top:0.5pt dashed #888">${ende ? `<span style="color:${FILLED};font-weight:600">${ende}</span>` : ""}</td>
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
    HotDoc · generiert ${formatDateTime(new Date().toISOString())}
    ${d.fahrzeugberichte && d.fahrzeugberichte.length > 0 ? `· ${d.fahrzeugberichte.length} Fahrzeugbericht(e) anbei` : ""}
    ${d.chronik && d.chronik.length > 0 ? `· Chronik (${d.chronik.length}) anbei` : ""}
  </div>
</div>

${renderChronikSeite(d)}
${renderFahrzeugberichtSeiten(d)}

</body>
</html>`;
}

/** Eigene Seite mit der vollstaendigen Einsatzchronik. */
function renderChronikSeite(d: BerichtDaten): string {
  if (!d.chronik || d.chronik.length === 0) return "";
  return /* html */ `
<div class="page">
  <div class="hd">
    <div class="hd-l">${renderBrandLogo()}</div>
    <div class="hd-r">
      <div class="hd-sub-title">Einsatzchronik</div>
      <div style="font-family:'Courier New',monospace;font-size:8pt;font-weight:600;margin-top:2pt;color:#555">
        ${escape(d.einsatzId)} · ${d.chronik.length} Einträge
      </div>
    </div>
  </div>
  <table class="chronik-tbl">
    <thead>
      <tr style="background:#f0f0f0">
        <td class="ts" style="font-weight:700">Zeit</td>
        <td class="src" style="font-weight:700;color:#000">Quelle</td>
        <td style="font-weight:700">Eintrag</td>
      </tr>
    </thead>
    <tbody>
      ${d.chronik
        .slice()
        .sort((a, b) => new Date(a.zeitstempel).getTime() - new Date(b.zeitstempel).getTime())
        .map(
          (c) => `<tr>
            <td class="ts">${formatTime(c.zeitstempel)}</td>
            <td class="src">${escape(c.funkrufname)}</td>
            <td>${escape(c.text)}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</div>`;
}

/** Eigene Seiten pro Fahrzeugbericht mit Mannschaft / Geräten / Taetigkeiten. */
function renderFahrzeugberichtSeiten(d: BerichtDaten): string {
  if (!d.fahrzeugberichte || d.fahrzeugberichte.length === 0) return "";
  return d.fahrzeugberichte
    .map(
      (f) => /* html */ `
<div class="page">
  <div class="hd">
    <div class="hd-l">${renderBrandLogo()}</div>
    <div class="hd-r">
      <div class="hd-sub-title">Fahrzeugbericht · ${escape(f.abk)}</div>
      <div style="font-family:'Courier New',monospace;font-size:8pt;font-weight:600;margin-top:2pt;color:#555">
        ${escape(f.funkrufname)} · ${f.status === "abgeschlossen" ? "ABGESCHLOSSEN" : "in Arbeit"}
      </div>
    </div>
  </div>

  <div class="fzg-detail">
    <div class="row"><b>KM gefahren</b><span style="color:#1e3a8a;font-weight:700">${f.kmGefahren.toFixed(1).replace(".", ",")} km</span></div>
    ${f.fahrzeugKdt ? `<div class="row"><b>Fahrzeug-Kdt</b><span style="color:#1e3a8a;font-weight:600">${escape(f.fahrzeugKdt)}</span></div>` : ""}
    ${f.fahrer ? `<div class="row"><b>Fahrer</b><span style="color:#1e3a8a;font-weight:600">${escape(f.fahrer)}</span></div>` : ""}
    <div class="row"><b>Mannschaft</b><span>${f.mannschaft.length} Personen</span></div>
    ${f.mannschaft.length > 0 ? `<ul>${f.mannschaft
      .map(
        (m) =>
          `<li>${escape(m.name)}${m.atemschutzAktiv ? ` <strong style="color:#b91c1c">(Atemschutz${m.atemschutzDauerMin ? ` · ${m.atemschutzDauerMin} min` : ""})</strong>` : ""}</li>`,
      )
      .join("")}</ul>` : ""}
    ${f.geraete.length > 0 ? `<div class="row"><b>Geräte</b><span style="color:#1e3a8a">${f.geraete.map(escape).join(" · ")}</span></div>` : ""}
    ${f.oelSaecke > 0 ? `<div class="row"><b>Ölbindemittel</b><span style="color:#1e3a8a;font-weight:700">${f.oelSaecke} Sack</span></div>` : ""}
    ${f.taetigkeitsbericht ? `<div style="margin-top:3mm"><b style="color:#555;font-size:8.5pt">Tätigkeiten:</b><div class="freitext" style="min-height:30mm;margin-top:1mm">${escape(f.taetigkeitsbericht)}</div></div>` : ""}
  </div>
</div>`,
    )
    .join("");
}

function boxFilled(checked: boolean): string {
  return checked
    ? `<span style="color:#1e3a8a">☒</span>`
    : `<span>☐</span>`;
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
