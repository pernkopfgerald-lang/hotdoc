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

import {
  escape,
  formatDate,
  formatTime,
  formatDateTime,
  renderBrandLogo,
} from "./_format.js";
import { renderFahrzeugberichtPageHtml } from "./fahrzeugbericht.js";
import { normalizeChronikEntry } from "./chronik-adapter.js";

export interface BerichtDaten {
  einsatzId: string;
  /** Berichts-Nr (Issue 24, Einsatz-Test 2026-06-02). Optional. */
  berichtsNummer?: string;
  /** Quelle des Berichts (BlaulichtSMS / Manuell / Übung / Lotsendienst). */
  einsatzQuelle?: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  einsatzort: string;
  alarmierungZeit: string;
  alarmierungAuthor?: string;
  einsatzTyp: "alarm" | "manuell";
  status: string;
  /**
   * Übungs-Modus (2026-06-03): wenn true, wird derselbe Renderer wie fuer den
   * Einsatzbericht verwendet, aber GRUEN als "ÜBUNG" gekennzeichnet, der Titel
   * lautet "Übungsbericht" und die Einsatz-spezifischen Bloecke (syBOS-Statistik,
   * Verrechnung, Pflichtbereich/Einsatzzone/ueberoertliche Hilfe, Einsatzauftrag-
   * via, Anrufer) werden ausgeblendet. Die generischen Bloecke (Mannschaft,
   * Geraete, Chronik, Fahrzeug-Anhangblaetter, Fotos) bleiben.
   */
  istUebung?: boolean;
  /** Übungs-Thema (nur Übung). Wird im Kopf neben dem Titel angezeigt. */
  uebungThema?: string;
  /** Übungsleiter-Name (nur Übung). Fallback auf `einsatzleiter`. */
  uebungsleiter?: string;
  /** Übungs-Typ/-Kategorie (nur Übung), z. B. "Atemschutz". */
  uebungsTyp?: string;
  /**
   * Lotsendienst-Modus (2026-06-05): wie die Übung laeuft der Lotsendienst
   * durch denselben Renderer wie der Einsatzbericht (renderHauptberichtHtml),
   * bekommt dadurch Chronik, je-Fahrzeug-Anhangblaetter, Mannschaft-mit-
   * Funktion + Geraete und Fotos. Akzentfarbe ist BERNSTEIN (#b45309), Titel
   * "Lotsendienst-Bericht", Quelle-Label "LOTSENDIENST". Die Einsatz-/Brand-
   * spezifischen Bloecke (syBOS-Statistik, Pflichtbereich/Einsatzzone/ueber-
   * oertliche Hilfe, Einsatzauftrag-via, Anrufer, Brand-Zeitmarken, Einsatz-
   * art-Tabelle) werden ausgeblendet. Der Verrechnungs-Block BLEIBT (Lotsen-
   * dienst ist verrechenbar). Auftraggeber + Route werden im Kopf angezeigt.
   */
  istLotsendienst?: boolean;
  /** Auftraggeber (nur Lotsendienst). Wird prominent im Kopf angezeigt. */
  lotsendienstAuftraggeber?: string;
  /** Route/Strecke (nur Lotsendienst). Wird im Kopf angezeigt wenn gesetzt. */
  lotsendienstRoute?: string;
  einsatzende?: string;
  /**
   * Einsatzleiter-Name (v0.1.15). Quelle: Fahrzeugbericht mit
   * kdtIstEinsatzleiter===true → dessen Kdt; Fallback einsatzleiterPersonId
   * am Einsatz-Doc. Wird unten in der Einsatzleiter-Box gerendert.
   */
  einsatzleiter?: string;
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
  /** AUDIT-14 (SF-02): Rechnungsadresse — gerendert im Verrechenbar-Block
   *  wenn verrechenbar === true. Quelle: doc.verrechnung.rechnungsadresse. */
  rechnungsadresse?: string;
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
    /** Foto-Funktion (2026-06-03): Referenz aufs Foto (falls Foto-Eintrag). */
    fotoId?: string;
  }>;
  /**
   * Foto-Funktion (2026-06-03): Einsatz-Fotos. Inline als 4×3-cm-Thumbnail in
   * der Chronik (verknüpft über fotoId), groß im Anhang (8,5×10,5 cm, 4 pro A4).
   */
  fotos?: Array<{
    fotoId: string;
    dataUrl: string;
    beschreibung?: string;
    aufgenommenAm: string;
    aufgenommenVon?: string;
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
  // Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik-Block. Optional.
  technischeStatistik?: {
    personenRettung?: {
      anzahlPersonen?: number;
      tot?: number;
      verletzt?: number;
      unverletzt?: number;
    };
    tierRettung?: { gross?: number; klein?: number };
    ursache?: string;
    hauptTaetigkeit?: string;
    weitereTaetigkeiten?: string[];
    gefaehrlicheStoffe?: string[];
  };
  // Issue 17 (Einsatz-Test 2026-06-02): syBOS Brand-Statistik-Block. Optional.
  brandStatistik?: {
    entdeckung?: string[];
    ausmass?: string;
    klassen?: string[];
    kategorie?: string;
    objektart1?: string;
    objektart2?: string;
    bauart?: string;
    lagen?: string[];
    verlauf?: string;
    personenRettung?: {
      anzahlPersonen?: number;
      tot?: number;
      verletzt?: number;
      unverletzt?: number;
    };
    tierRettung?: { gross?: number; klein?: number };
  };
}

// Issue #169 (v0.1.12): Der frühere große Einsatzart-Block mit 28
// Vordruck-Checkboxen wurde ersetzt durch eine einfache Wert-Zeile
// (siehe renderHauptberichtHtml). Grund: die Match-Logik gegen den
// fix definierten Vordruck-Katalog war brüchig — wenn der User eine
// Einsatzart wählte, die nicht 1:1 dem Matrix-Eintrag entsprach
// (z. B. Tippvariante oder Stichwort aus syBOS), bekam der Sachbearbeiter
// im PDF eine komplett leere Einsatzart-Matrix. Eine einzige Wert-Zeile
// ist robust und einsparsamer.
const ALARMQUELLEN = ["WAS", "Funk", "Telefon", "Bote", "Behoerde"] as const;

export function renderHauptberichtHtml(d: BerichtDaten): string {
  const isUebung = d.istUebung === true;
  const isLotsen = d.istLotsendienst === true;
  // Gemeinsam-auszublendende Einsatz-/Brand-only-Bloecke (syBOS-Statistik,
  // Pflichtbereich/Einsatzzone/Alarmierung/Anrufer, Einsatzart-Tabelle, Brand-
  // Zeitmarken) gelten weder fuer die Übung noch fuer den Lotsendienst.
  const isSpezial = isUebung || isLotsen;
  const isManuell = d.einsatzTyp === "manuell";
  const datum = formatDate(d.alarmierungZeit);
  const datumZeit = `${datum} · ${formatTime(d.alarmierungZeit)}`;
  const ende = d.einsatzende ? `${formatDate(d.einsatzende)} · ${formatTime(d.einsatzende)}` : "";

  // Brand-konsistente Farbe fuer ausgefuellte Werte (dunkelblau) — matcht
  // die Tablet-UX wo eingegebene Felder ebenfalls dunkelblau dargestellt
  // werden. Trennt User-Daten visuell vom Papier-Raster.
  // Übung (2026-06-03): bei einer Übung wird die Akzentfarbe GRUEN, damit der
  // Empfaenger sofort sieht, dass das KEIN Brand-/Einsatzbericht ist.
  // Lotsendienst (2026-06-05): BERNSTEIN — klar unterscheidbar von Einsatz
  // (blau) und Übung (gruen).
  const FILLED = isUebung ? "#15803d" : isLotsen ? "#b45309" : "#1e3a8a";
  const titel = isUebung ? "Übungsbericht" : isLotsen ? "Lotsendienst-Bericht" : "Einsatzbericht";
  const quelleLabel = isUebung
    ? "ÜBUNG"
    : isLotsen
      ? "LOTSENDIENST"
      : isManuell
        ? "MANUELL"
        : "BlaulichtSMS";

  // Hilfsfunktion: Wert dunkelblau rendern wenn vorhanden, sonst Leerzeile
  const v = (val: string | undefined | null, fallback = "—"): string =>
    val && val.trim()
      ? `<span style="color:${FILLED};font-weight:600">${escape(val)}</span>`
      : fallback;
  const vTime = (val: string | undefined): string =>
    val ? `<span style="color:${FILLED};font-weight:600">${escape(formatTime(val))}</span>` : "__ : __";
  const triBox = (val: boolean | null | undefined, label: string): string => {
    // Markierung ueber Box (sichtbares ✕ in dunkelblauem Quadrat) PLUS
    // Text-Faerbung — User-Variante: beides zusammen damit auch beim
    // schnellen Ueberfliegen klar ist was selektiert ist.
    if (val === true) return `${boxFilled(true)} <strong style="color:${FILLED}">${label}</strong>`;
    if (val === false) return `${boxFilled(false)} ${label}`;
    return `${boxFilled(false)} ${label}`;
  };

  const eingesetzeFzgSet = new Set(
    (d.eingesetzteFahrzeuge ?? []).map((f) => f.abk.toUpperCase()),
  );
  const FAHRZEUGE_REIHE = ["KDO", "TANK", "LFA-B", "PKW-Anhänger", "MTF", "HR-Anhänger", "Stapler"] as const;

  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${titel} ${escape(d.einsatzId)}</title>
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
      ${isSpezial ? `<div style="display:inline-block;background:${FILLED};color:#fff;font-size:10pt;font-weight:800;letter-spacing:0.14em;padding:2pt 8pt;border-radius:2pt;margin-bottom:2pt">${quelleLabel}</div>` : ""}
      <div class="hd-title" style="${isSpezial ? `color:${FILLED}` : ""}">${titel}</div>
      ${
        d.berichtsNummer
          ? `<div style="font-size:11pt;font-weight:700;margin-top:2pt;color:#000">Berichts-Nr <b>${escape(d.berichtsNummer)}</b></div>`
          : ""
      }
      <div style="font-family:'Courier New',monospace;font-size:9pt;font-weight:600;margin-top:2pt;">
        ${escape(d.einsatzId)} · ${quelleLabel}
      </div>
    </div>
  </div>

  ${
    isUebung
      ? `<table class="bx">
    <tr>
      <td class="lbl" style="width:64%">Übungsthema</td>
      <td class="lbl">Übungsleiter</td>
    </tr>
    <tr>
      <td class="val big">${v(d.uebungThema ?? d.einsatzart)}</td>
      <td class="val big">${v(d.uebungsleiter ?? d.einsatzleiter)}</td>
    </tr>
    ${d.uebungsTyp ? `<tr>
      <td class="lbl" colspan="2">Übungstyp</td>
    </tr>
    <tr>
      <td class="val" colspan="2">${v(d.uebungsTyp)}</td>
    </tr>` : ""}
  </table>`
      : ""
  }

  ${
    isLotsen
      ? `<table class="bx">
    <tr>
      <td class="lbl" style="width:50%">Auftraggeber</td>
      <td class="lbl">Einsatzleiter</td>
    </tr>
    <tr>
      <td class="val big">${v(d.lotsendienstAuftraggeber)}</td>
      <td class="val big">${v(d.einsatzleiter)}</td>
    </tr>
    ${d.lotsendienstRoute ? `<tr>
      <td class="lbl" colspan="2">Route / Strecke</td>
    </tr>
    <tr>
      <td class="val" colspan="2" style="white-space:pre-wrap">${v(d.lotsendienstRoute)}</td>
    </tr>` : ""}
  </table>`
      : ""
  }

  <table class="bx">
    <tr>
      <td class="lbl" style="width:64%">${isUebung ? "Übungsort" : isLotsen ? "Ort / Treffpunkt" : "Einsatzort"}</td>
      <td class="lbl">Datum und Uhrzeit</td>
    </tr>
    <tr>
      <td class="val big">${escape(d.einsatzort)}</td>
      <td class="val big">${datumZeit}</td>
    </tr>
  </table>

  ${
    isSpezial
      ? ""
      : `<table class="bx cb-row">
    <tr>
      <td style="width:25%">Pflichtbereich
        <span class="cb">${triBox(d.pflichtbereich === true, "JA")}</span>
        <span class="cb">${triBox(d.pflichtbereich === false, "NEIN")}</span>
      </td>
      <td style="width:25%">Einsatzzone Eberstalzell
        <span class="cb">${triBox(d.einsatzzoneEzell === true, "JA")}</span>
        <span class="cb">${triBox(d.einsatzzoneEzell === false, "NEIN")}</span>
      </td>
      <td>Alarmiert durch
        <span class="cb">${boxFilled(d.alarmierungAuthor === "BWST")} BWST</span>
        <span class="cb">${boxFilled(d.alarmierungAuthor === "LWZ")} LWZ</span>
        ${d.alarmierungAuthor && d.alarmierungAuthor !== "BWST" && d.alarmierungAuthor !== "LWZ" ? `<span class="cb">${boxFilled(true)} <strong style="color:${FILLED}">${escape(d.alarmierungAuthor)}</strong></span>` : ""}
      </td>
    </tr>
    <tr>
      <td colspan="3">Überörtliche Hilfe
        <span class="cb">${triBox(d.ueberOertlicheHilfe === true, "JA")}</span>
        <span class="cb">${triBox(d.ueberOertlicheHilfe === false, "NEIN")}</span>
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
  </table>`
  }

  <table class="bx cb-row">
    <tr><td class="lbl" colspan="7">${isUebung ? "Beteiligte Fahrzeuge" : "Eingesetzte Fahrzeuge"}</td></tr>
    <tr>
      ${FAHRZEUGE_REIHE.map(
        (f) => {
          const sel = eingesetzeFzgSet.has(f.toUpperCase());
          return `<td style="text-align:center;${sel ? `color:${FILLED};font-weight:700;` : ""}">${boxFilled(sel)} ${f}</td>`;
        },
      ).join("")}
    </tr>
  </table>

  ${
    isSpezial
      ? ""
      : `<table class="bx">
    <tr>
      <td class="lbl" style="width:30%">Einsatzart</td>
      <td class="val big">${v(d.einsatzart ?? d.einsatzartFreitext)}</td>
    </tr>
    ${d.einsatzart && d.einsatzartFreitext ? `<tr>
      <td class="lbl">Andere Einsätze</td>
      <td class="val">${v(d.einsatzartFreitext)}</td>
    </tr>` : ""}
  </table>`
  }

  ${
    isSpezial
      ? `<table class="bx" style="margin-top:1mm">
    <tr><td class="lbl">Beteiligte Stellen</td></tr>
    <tr>
      <td class="val">
        ${
          d.beteiligteStellen && d.beteiligteStellen.length > 0
            ? d.beteiligteStellen
                .map((s) => `<span style="color:${FILLED};font-weight:600">${boxFilled(true)} ${escape(s)}</span><br>`)
                .join("")
            : `<span style="color:#888">keine angegeben</span>`
        }
      </td>
    </tr>
  </table>`
      : `<table class="bx" style="margin-top:1mm">
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
  </table>`
  }

  <table class="bx">
    <tr>
      <td class="lbl" colspan="2">Sonstige anwesende Feuerwehren</td>
      <td class="lbl">Mannschaft</td>
      ${isUebung ? "" : `<td class="lbl">Verrechenbar / Öl</td>`}
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
        ${isUebung ? "Teilnehmer" : "Eingesetzt"}: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.eingesetzt ?? 0}</span> Personen<br>
        Bereitschaft: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.bereitschaft ?? 0}</span><br>
        Sonstige: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.sonstige ?? 0}</span><br>
        AS-Trupps: <span style="color:${FILLED};font-weight:700">${d.mannschaft?.atemschutzTrupps ?? 0}</span>
      </td>
      ${
        isUebung
          ? ""
          : `<td class="val" style="vertical-align:top">
        Verrechenbar: <span class="cb">${boxFilled(d.verrechenbar === true)} JA</span> · <span class="cb">${boxFilled(d.verrechenbar === false)} NEIN</span>${d.verrechenbar === true && d.rechnungsadresse ? `<br>Rechnung an: <span style="color:${FILLED};font-weight:600">${escape(d.rechnungsadresse)}</span>` : ""}<br>
        Ölbindemittel: ${
          d.oelbindemittelSaecke && d.oelbindemittelSaecke > 0
            ? `<strong style="color:${FILLED}">${boxFilled(true)} ${d.oelbindemittelSaecke} Sack</strong>`
            : `${boxFilled(false)} 0 Sack`
        }
      </td>`
      }
    </tr>
  </table>

  <table class="bx">
    <tr><td class="lbl">${isUebung ? "Übungschronik / Tätigkeitsbericht" : isLotsen ? "Lotsendienst-Chronik / Tätigkeitsbericht" : "Meldung von der Einsatzleitung (Einsatzchronik)"}</td></tr>
    <tr><td>${renderMeldungEinsatzleitungInhalt(d)}</td></tr>
  </table>

  ${isSpezial ? "" : renderTechnischeStatistikBlock(d)}
  ${isSpezial ? "" : renderBrandStatistikBlock(d)}

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
      <td class="lbl" style="width:50%">${isUebung ? "Übungsleiter" : "Einsatzleiter"}</td>
      <td class="lbl">${isUebung ? "Übungsende" : "Einsatzende"}</td>
    </tr>
    <tr>
      <td class="val" style="height:10mm;border-top:0.5pt dashed #888">${
        (() => {
          const leiter = isUebung ? (d.uebungsleiter ?? d.einsatzleiter) : d.einsatzleiter;
          return leiter ? `<span style="color:${FILLED};font-weight:600">${escape(leiter)}</span>` : "";
        })()
      }</td>
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
    ${d.fotos && d.fotos.length > 0 ? `· ${d.fotos.length} Foto(s) anbei` : ""}
  </div>
</div>

${renderFahrzeugberichtSeiten(d)}
${renderFotoAnhang(d)}

</body>
</html>`;
}

/**
 * Issue #170 (v0.1.12): Inhalt der "Meldung von der Einsatzleitung"-Box
 * wird mit der Einsatzchronik gefuellt. User-Klarstellung:
 * "Meldung von der Einsatzleitung ist unsere Einsatzchronik".
 *
 * Format (Einsatz-Test 2026-06-03): maximal platzsparend, EIN Eintrag =
 * EINE Zeile — `HH:MM <Quelle>: <Text>` eng gesetzt (8.5pt, line-height
 * ~1.25, keine Leerzeilen, keine Trennlinien). Sortiert chronologisch.
 * Bei Foto-Eintraegen folgt unter der Zeile ein kleines Thumbnail
 * (~2,5×1,9 cm, 4:3) — verknuepft ueber fotoId. Optional vorhandener
 * `meldungEinsatzleitung`-Freitext (Bestandsfeld) als kurze einzeilige
 * Praeambel, damit alte Berichte nichts verlieren.
 *
 * Die separate Chronik-Anhang-Seite wurde entfernt — die Chronik wird
 * komplett hier auf Seite 1 gefuehrt. Der grosse Foto-Anhang
 * (8,5×10,5 cm, 4 pro A4) bleibt erhalten (renderFotoAnhang).
 */
function renderMeldungEinsatzleitungInhalt(d: BerichtDaten): string {
  const FILLED = "#1e3a8a";
  const altFreitext = (d.meldungEinsatzleitung ?? "").trim();
  const chronik = (d.chronik ?? []).slice();

  if (chronik.length === 0 && !altFreitext) {
    return `<div class="freitext" style="color:#888"></div>`;
  }

  // Praeambel: das alte meldungEinsatzleitung-Freitext-Feld (falls befuellt)
  // bleibt sichtbar — als kurze einzeilige Vorbemerkung ueber der Chronik.
  const praeambel = altFreitext
    ? `<div style="color:${FILLED};font-weight:500;margin-bottom:2pt;white-space:pre-wrap">${escape(altFreitext)}</div>`
    : "";

  if (chronik.length === 0) {
    return `<div class="freitext">${praeambel}</div>`;
  }

  // Foto-Funktion (2026-06-03): fotoId → dataUrl für Inline-Thumbnails.
  const fotoMap = new Map((d.fotos ?? []).map((f) => [f.fotoId, f.dataUrl]));

  // Chronologisch sortieren.
  chronik.sort(
    (a, b) => new Date(a.zeitstempel).getTime() - new Date(b.zeitstempel).getTime(),
  );

  // EIN Eintrag = EINE Zeile: `HH:MM Quelle: Text`. Eng gesetzt,
  // keine Leerzeilen/Trennlinien dazwischen. Foto-Eintraege bekommen
  // unter der Zeile ein kleines 2,5×1,9-cm-Thumbnail (4:3).
  const zeilen = chronik
    .map((c) => {
      const zeit = formatTime(c.zeitstempel);
      const quelle = c.funkrufname || c.source || "—";
      const text = stripAuftragsPrefix(c.text ?? "");
      const foto = c.fotoId ? fotoMap.get(c.fotoId) : undefined;
      const thumb = foto
        ? `<div style="margin:1pt 0 1.5pt"><img src="${foto}" alt="Foto" style="width:25mm;height:19mm;object-fit:cover;border:0.4pt solid #999" /></div>`
        : "";
      return `<div style="line-height:1.25;margin:0">` +
        `<span style="font-family:'Courier New',monospace;color:#555">${escape(zeit)}</span> ` +
        `<span style="color:${FILLED};font-weight:600">${escape(quelle)}:</span> ` +
        `<span>${escape(text)}</span>` +
        `</div>${thumb}`;
    })
    .join("");

  return `<div class="freitext" style="font-weight:500;font-size:8.5pt;line-height:1.25">${praeambel}${zeilen}</div>`;
}

/**
 * Foto-Funktion (2026-06-03): Foto-Anhang-Seiten. Alle Einsatz-Fotos groß
 * (8,5×10,5 cm), 4 pro A4-Blatt im 2×2-Raster, mit Zeit + Beschreibung als
 * Bildunterschrift. Leerer String wenn keine Fotos vorhanden.
 *
 * AUDIT-16 (SF-08 Stufe 1): Bildboxen 85×105 mm + 6 mm Raster-Abstand —
 * damit passt das 2×2-Raster inkl. Header rechnerisch sicher in die
 * nutzbaren ~265×178 mm bei den 16-mm-Puppeteer-Raendern (generator.ts).
 * Vorher 90×120 mm: Folgeseiten-Ueberlauf / beschnittene Spalten.
 */
function renderFotoAnhang(d: BerichtDaten): string {
  const fotos = (d.fotos ?? []).slice().sort(
    (a, b) => new Date(a.aufgenommenAm).getTime() - new Date(b.aufgenommenAm).getTime(),
  );
  if (fotos.length === 0) return "";
  // In 4er-Gruppen (2×2 pro Seite) aufteilen.
  const seiten: (typeof fotos)[] = [];
  for (let i = 0; i < fotos.length; i += 4) seiten.push(fotos.slice(i, i + 4));
  return seiten
    .map(
      (gruppe, seiteIdx) => /* html */ `
<div class="page">
  <div class="hd">
    <div class="hd-l">${renderBrandLogo()}</div>
    <div class="hd-r">
      <div class="hd-sub-title">Foto-Anhang${seiten.length > 1 ? ` (${seiteIdx + 1}/${seiten.length})` : ""}</div>
      <div style="font-family:'Courier New',monospace;font-size:8pt;font-weight:600;margin-top:2pt;color:#555">
        ${escape(d.einsatzId)} · ${fotos.length} Foto(s)
      </div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-top:4mm">
    ${gruppe
      .map(
        (f) => `<div style="display:flex;flex-direction:column;gap:2mm">
          <img src="${f.dataUrl}" alt="Einsatz-Foto" style="width:85mm;height:105mm;object-fit:contain;border:0.5pt solid #999;background:#f4f4f4" />
          <div style="font-size:8.5pt;color:#333;line-height:1.3">
            <strong>${formatTime(f.aufgenommenAm)}</strong>${f.aufgenommenVon ? ` · ${escape(f.aufgenommenVon)}` : ""}${f.beschreibung ? `<br/>${escape(f.beschreibung)}` : ""}
          </div>
        </div>`,
      )
      .join("")}
  </div>
</div>`,
    )
    .join("");
}

/**
 * Eigene Seiten pro Fahrzeugbericht mit dem Original-Vordruck-Tabellen-
 * Layout. Wird vom standalone-Fahrzeugbericht-PDF (fahrzeugbericht.ts)
 * geteilt, damit beide Varianten konsistent dasselbe Layout zeigen.
 * Frueher war das ein eigenes Key-Value-Layout — User hat sich
 * beklagt dass das nicht dem Original-Vordruck entspricht.
 */
function renderFahrzeugberichtSeiten(d: BerichtDaten): string {
  if (!d.fahrzeugberichte || d.fahrzeugberichte.length === 0) return "";
  return d.fahrzeugberichte
    .map(
      (f) => /* html */ `
<div class="page">
  ${renderFahrzeugberichtPageHtml(
    {
      einsatzId: d.einsatzId,
      ...(d.berichtsNummer ? { berichtsNummer: d.berichtsNummer } : {}),
      ...(d.einsatzQuelle ? { einsatzQuelle: d.einsatzQuelle } : {}),
      fahrzeugId: f.abk,
      abk: f.abk,
      funkrufname: f.funkrufname,
      einsatzort: d.einsatzort,
      alarmierungZeit: d.alarmierungZeit,
      ...(d.einsatzende ? { zeitBis: d.einsatzende } : {}),
      kmGefahren: f.kmGefahren,
      ...(f.fahrer ? { fahrer: f.fahrer } : {}),
      ...(f.fahrzeugKdt ? { fahrzeugKdt: f.fahrzeugKdt } : {}),
      mannschaft: f.mannschaft.map((m) => ({
        name: m.name,
        atemschutzAktiv: m.atemschutzAktiv,
        ...(m.atemschutzDauerMin !== undefined
          ? { atemschutzDauerMin: m.atemschutzDauerMin }
          : {}),
      })),
      geraete: f.geraete,
      oelSaecke: f.oelSaecke,
      taetigkeitsbericht: f.taetigkeitsbericht ?? "",
      chronik: [],
      status: f.status,
    },
    // Footer-Banner "Näherer Tätigkeitsbericht auf Rückseite" weglassen —
    // im Hauptbericht-Anhang folgt der Tätigkeitsbericht direkt unter der
    // Tabelle auf derselben Seite, der Verweis auf eine Rückseite waere
    // irreführend.
    { showRueckseiteFooter: false },
  )}
  ${
    f.taetigkeitsbericht
      ? `<div style="margin-top:5mm">
           <h2 style="font-size:12pt;font-weight:700;margin:0 0 2mm;padding-bottom:2pt;border-bottom:1pt solid #000;font-family:Arial,sans-serif">Tätigkeitsbericht · ${escape(f.abk)}</h2>
           <div style="padding:5pt 7pt;border:0.8pt solid #000;white-space:pre-wrap;font-size:10.5pt;line-height:1.5;font-family:Arial,sans-serif">${escape(f.taetigkeitsbericht)}</div>
         </div>`
      : ""
  }
</div>`,
    )
    .join("");
}

/**
 * Echte HTML-Checkbox die in PDF-Output zuverlaessig dargestellt wird.
 * Frueher Unicode ☒/☐ — Chromium-PDF-Renderer faellt bei manchen
 * Fonts auf das Default-Glyph (immer leere Box) zurueck, was nach
 * User-Beschwerde im Screenshot sichtbar wurde.
 *
 * Layout: 10x10 px Quadrat mit 1pt-Border. Bei checked=true ist
 * der Hintergrund FILLED (#1e3a8a) und ein weisses X drueber, sehr
 * gut sichtbar im Druck.
 */
function boxFilled(checked: boolean): string {
  if (checked) {
    return `<span style="display:inline-block;width:10px;height:10px;border:1pt solid #1e3a8a;background:#1e3a8a;color:#fff;text-align:center;font-size:9pt;line-height:9pt;font-weight:700;vertical-align:middle;margin-right:2pt">✕</span>`;
  }
  return `<span style="display:inline-block;width:10px;height:10px;border:1pt solid #000;vertical-align:middle;margin-right:2pt"></span>`;
}

export function renderSpickzettelHtml(d: BerichtDaten): string {
  // AUDIT-14 (SF-12): Spickzettel typabhaengig — Uebung und Lotsendienst
  // bekommen ihre eigenen Abtipp-Zeilen, die Berichts-Nr (nach AUDIT-11 die
  // echte) steht im Kopf. Der Spickzettel ist KEIN Papier-Vordruck und darf
  // frei erweitert werden.
  const istUebung = d.istUebung === true;
  const istLotsen = d.istLotsendienst === true;
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
    Bericht <span class="nr">${escape(d.berichtsNummer ?? d.einsatzId)}</span>${d.berichtsNummer ? ` · ${escape(d.einsatzId)}` : ""} ·
    bearbeite diesen ${istUebung ? "Übungsbericht" : istLotsen ? "Lotsendienst" : "Einsatz"} in syBOS in folgender Reihenfolge:
  </div>
  <ol>
    ${d.berichtsNummer ? `<li>Berichts-Nr: <span class="val">${escape(d.berichtsNummer)}</span></li>` : ""}
    <li>${istUebung ? "Übungsort" : istLotsen ? "Ort / Treffpunkt" : "Einsatzort"}: <span class="val">${escape(d.einsatzort)}</span></li>
    <li>Datum / Uhrzeit: <span class="val">${formatDateTime(d.alarmierungZeit)}</span></li>
    ${
      istUebung
        ? `<li>Übungsthema: <span class="val">${escape(d.uebungThema ?? "—")}</span></li>
    <li>Übungstyp: <span class="val">${escape(d.uebungsTyp ?? "—")}</span></li>
    <li>Übungsleiter: <span class="val">${escape(d.uebungsleiter ?? "—")}</span></li>`
        : istLotsen
          ? `<li>Auftraggeber: <span class="val">${escape(d.lotsendienstAuftraggeber ?? "—")}</span></li>
    ${d.lotsendienstRoute ? `<li>Route / Strecke: <span class="val">${escape(d.lotsendienstRoute)}</span></li>` : ""}
    ${d.rechnungsadresse ? `<li>Rechnungsadresse: <span class="val">${escape(d.rechnungsadresse)}</span></li>` : ""}`
          : `<li>Einsatzart: <span class="val">${escape(d.einsatzart ?? d.einsatzartFreitext ?? "—")}</span></li>`
    }
    ${d.alarmierungAuthor ? `<li>Alarmierungsquelle: <span class="val">${escape(d.alarmierungAuthor)}</span></li>` : ""}
    ${d.einsatzende ? `<li>${istUebung ? "Übungsende" : "Einsatzende"}: <span class="val">${formatDateTime(d.einsatzende)}</span></li>` : ""}
    ${d.oelbindemittelSaecke ? `<li>Ölbindemittel: <span class="val">${d.oelbindemittelSaecke} Säcke (VERRECHENBAR)</span></li>` : ""}
    ${!istUebung && !istLotsen && d.rechnungsadresse ? `<li>Rechnungsadresse: <span class="val">${escape(d.rechnungsadresse)}</span></li>` : ""}
    <li>Bericht-PDF als Anhang an den syBOS-Eintrag hängen.</li>
  </ol>
  <p style="margin-top:18pt;font-size:9pt;color:#888;">
    HotDoc · generiert ${formatDateTime(new Date().toISOString())}
  </p>
</body>
</html>`;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik-PDF-Block.
 * Wird nur gerendert wenn `technischeStatistik` am Doc steht. Layout:
 * 2-spaltige Tabelle mit den Werten — der Sachbearbeiter kann sie direkt
 * in die syBOS-Maske abtippen ohne den Einsatzleiter nochmal zu fragen.
 */
function renderTechnischeStatistikBlock(d: BerichtDaten): string {
  const ts = d.technischeStatistik;
  if (!ts) return "";
  const FILLED = "#1e3a8a";
  const v = (val: string | undefined): string =>
    val && val.trim()
      ? `<span style="color:${FILLED};font-weight:600">${escape(val)}</span>`
      : `<span style="color:#888">—</span>`;
  const vNum = (n: number | undefined): string =>
    typeof n === "number" && n > 0
      ? `<span style="color:${FILLED};font-weight:700">${n}</span>`
      : `<span style="color:#888">0</span>`;
  const vList = (arr: string[] | undefined): string => {
    if (!arr || arr.length === 0) return `<span style="color:#888">—</span>`;
    return arr
      .map((s) => `<span style="color:${FILLED};font-weight:600">${escape(s)}</span>`)
      .join(", ");
  };
  return /* html */ `
  <table class="bx" style="margin-top:2mm">
    <tr><td class="lbl" colspan="2">syBOS Technisch-Statistik (Übertrag in syBOS-Maske)</td></tr>
    <tr>
      <td class="lbl" style="width:25%">Personenrettung</td>
      <td class="val">
        Anzahl: ${vNum(ts.personenRettung?.anzahlPersonen)} ·
        Tot: ${vNum(ts.personenRettung?.tot)} ·
        Verletzt: ${vNum(ts.personenRettung?.verletzt)} ·
        Unverletzt: ${vNum(ts.personenRettung?.unverletzt)}
      </td>
    </tr>
    <tr>
      <td class="lbl">Tierrettung</td>
      <td class="val">
        Groß: ${vNum(ts.tierRettung?.gross)} ·
        Klein: ${vNum(ts.tierRettung?.klein)}
      </td>
    </tr>
    <tr><td class="lbl">Ursache</td><td class="val">${v(ts.ursache)}</td></tr>
    <tr><td class="lbl">Haupt-Tätigkeit</td><td class="val">${v(ts.hauptTaetigkeit)}</td></tr>
    <tr><td class="lbl">Weitere Tätigkeiten</td><td class="val">${vList(ts.weitereTaetigkeiten)}</td></tr>
    <tr><td class="lbl">Gefährliche Stoffe</td><td class="val">${vList(ts.gefaehrlicheStoffe)}</td></tr>
  </table>`;
}

/**
 * Issue 17 (Einsatz-Test 2026-06-02): syBOS Brand-Statistik-PDF-Block.
 * Wird nur gerendert wenn `brandStatistik` am Doc steht (= BrandAbschluss-
 * Wizard wurde vor dem /abschluss-Call durchlaufen). Layout: 2-spaltige
 * Tabelle. Personen-/Tierrettung-Zeile spiegelt das Schema aus der
 * Technisch-Statistik, weil syBOS dort identisch fragt.
 */
function renderBrandStatistikBlock(d: BerichtDaten): string {
  const bs = d.brandStatistik;
  if (!bs) return "";
  const FILLED = "#1e3a8a";
  const v = (val: string | undefined): string =>
    val && val.trim()
      ? `<span style="color:${FILLED};font-weight:600">${escape(val)}</span>`
      : `<span style="color:#888">—</span>`;
  const vNum = (n: number | undefined): string =>
    typeof n === "number" && n > 0
      ? `<span style="color:${FILLED};font-weight:700">${n}</span>`
      : `<span style="color:#888">0</span>`;
  const vList = (arr: string[] | undefined): string => {
    if (!arr || arr.length === 0) return `<span style="color:#888">—</span>`;
    return arr
      .map((s) => `<span style="color:${FILLED};font-weight:600">${escape(s)}</span>`)
      .join(", ");
  };
  return /* html */ `
  <table class="bx" style="margin-top:2mm">
    <tr><td class="lbl" colspan="2">syBOS Brand-Statistik (Übertrag in syBOS-Maske)</td></tr>
    <tr><td class="lbl" style="width:25%">Entdeckung</td><td class="val">${vList(bs.entdeckung)}</td></tr>
    <tr><td class="lbl">Ausmaß</td><td class="val">${v(bs.ausmass)}</td></tr>
    <tr><td class="lbl">Brand-Klassen</td><td class="val">${vList(bs.klassen)}</td></tr>
    <tr>
      <td class="lbl">Objekt</td>
      <td class="val">
        Kategorie: ${v(bs.kategorie)}
        ${bs.objektart1 ? ` · Objektart 1: ${v(bs.objektart1)}` : ""}
        ${bs.objektart2 ? ` · Objektart 2: ${v(bs.objektart2)}` : ""}
      </td>
    </tr>
    <tr><td class="lbl">Bauart</td><td class="val">${v(bs.bauart)}</td></tr>
    <tr><td class="lbl">Lage</td><td class="val">${vList(bs.lagen)}</td></tr>
    <tr><td class="lbl">Verlauf</td><td class="val">${v(bs.verlauf)}</td></tr>
    <tr>
      <td class="lbl">Personenrettung</td>
      <td class="val">
        Anzahl: ${vNum(bs.personenRettung?.anzahlPersonen)} ·
        Tot: ${vNum(bs.personenRettung?.tot)} ·
        Verletzt: ${vNum(bs.personenRettung?.verletzt)} ·
        Unverletzt: ${vNum(bs.personenRettung?.unverletzt)}
      </td>
    </tr>
    <tr>
      <td class="lbl">Tierrettung</td>
      <td class="val">
        Groß: ${vNum(bs.tierRettung?.gross)} ·
        Klein: ${vNum(bs.tierRettung?.klein)}
      </td>
    </tr>
  </table>`;
}

/**
 * Backwards-Compat: alte Chronik-Eintraege haben einen "Auftrag begonnen: "-
 * Prefix, neue nicht mehr (Issue 23). Beim Rendern strippen wir den Prefix
 * damit das PDF konsistent aussieht — egal ob ein Eintrag aus pre-v0.1.10
 * stammt oder neuer ist.
 */
function stripAuftragsPrefix(text: string): string {
  return text.replace(/^Auftrag begonnen:\s*/i, "");
}
