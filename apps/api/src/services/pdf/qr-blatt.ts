/**
 * QR-Uebersichtsblatt: EIN A4-Blatt mit den QR-Codes aller Fahrzeuge (und der
 * Florianstation) zum zentralen Aushang — wer scannt, landet direkt im
 * Einsatzbericht des jeweiligen Fahrzeugs.
 *
 * Die QR-Grafiken kommen als fertiges SVG vom Backoffice (dort erzeugt mit
 * qrcode.react, keine neue Abhaengigkeit im API). Das SVG wird streng geprueft
 * (nur <svg>/<path>, keine Skripte/Links), Beschriftung, Farben und
 * Reihenfolge bestimmt der Server selbst.
 */

import { FAHRZEUGE, type FahrzeugId } from "@hotdoc/shared";
import { getBrandLogoDataUrl } from "./brand.js";

/** Reihenfolge auf dem Blatt (links→rechts, oben→unten). */
export const QR_BLATT_FAHRZEUGE: readonly FahrzeugId[] = [
  "kdo",
  "tlf-a-4000",
  "lfa-b",
  "mtf",
  "zentrale",
];

/** Gleiche Fahrzeugfarben wie die Kopfzeile der App. */
const FARBE: Record<string, string> = {
  kdo: "#1D4ED8",
  "tlf-a-4000": "#B91C1C",
  "lfa-b": "#B45309",
  mtf: "#047857",
  zentrale: "#6D28D9",
};

/**
 * Nur das, was qrcode.react erzeugt: <svg …><path …></path>…</svg>.
 * Keine anderen Tags, keine Event-Attribute, keine Verweise.
 */
export function istSichereQrSvg(svg: unknown): svg is string {
  if (typeof svg !== "string" || svg.length > 400_000) return false;
  if (!/^<svg\s[^<>]*>(?:<path\s[^<>]*>(?:<\/path>)?)+<\/svg>$/.test(svg)) return false;
  // Attribute nur aus harmlosen Zeichen; nichts wie on…=, href, style, javascript:
  const tags = svg.match(/<[^>]+>/g) ?? [];
  for (const t of tags) {
    if (/\bon[a-z]+\s*=/i.test(t)) return false;
    if (/href|xlink|style|script|javascript:|data:|url\(/i.test(t)) return false;
  }
  return true;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Feste Breite/Hoehe aus dem oeffnenden <svg>-Tag entfernen — die Groesse steuert das CSS. */
function skaliere(svg: string): string {
  return svg.replace(/^<svg\s[^>]*>/, (open) =>
    open.replace(/\s(?:width|height)="[^"]*"/g, ""),
  );
}

export interface QrBlattEintrag {
  fahrzeugId: FahrzeugId;
  svg: string;
}

export function renderQrBlattHtml(eintraege: readonly QrBlattEintrag[], jetzt: Date = new Date()): string {
  const byId = new Map(eintraege.map((e) => [e.fahrzeugId, e.svg]));
  const logo = getBrandLogoDataUrl();
  const stand = new Intl.DateTimeFormat("de-AT", {
    timeZone: "Europe/Vienna",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(jetzt);

  const zellen = QR_BLATT_FAHRZEUGE.filter((id) => byId.has(id))
    .map((id) => {
      const f = FAHRZEUGE[id];
      const farbe = FARBE[id] ?? "#222";
      const kurz = id === "zentrale" ? "FLORIAN" : f.bezeichnung;
      return `<div class="cell">
  <div class="cell-h" style="background:${farbe}">
    <div class="abk">${esc(kurz)}</div>
    <div class="funk">${esc(f.funkrufname)}</div>
  </div>
  <div class="qr">${skaliere(byId.get(id)!)}</div>
</div>`;
    })
    .join("\n");

  return /* html */ `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>HotDoc – Fahrzeug scannen</title>
  <style>
    @page { size: A4 portrait; margin: 16mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000;
      font-family: Arial, "Helvetica Neue", sans-serif; }
    .sheet { width: 178mm; height: 262mm; display: flex; flex-direction: column; overflow: hidden; }
    .hd { display: flex; align-items: center; justify-content: space-between; gap: 8mm;
      padding-bottom: 4mm; border-bottom: 1.2pt solid #000; }
    .hd img { height: 16mm; width: auto; display: block; }
    .hd h1 { margin: 0; font-size: 25pt; line-height: 1.05; font-weight: 800; text-align: right; }
    .hd p { margin: 2mm 0 0; font-size: 11.5pt; text-align: right; }
    .grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr);
      gap: 5mm; margin-top: 5mm; min-height: 0; }
    .cell { border: 1.2pt solid #000; border-radius: 2mm; overflow: hidden; display: flex;
      flex-direction: column; min-height: 0; }
    .cell-h { color: #fff; padding: 2.2mm 4mm; }
    .abk { font-size: 21pt; font-weight: 800; line-height: 1.05; }
    .funk { font-size: 10.5pt; font-weight: 600; margin-top: 0.5mm; }
    .qr { flex: 1; min-height: 0; padding: 2.5mm; display: flex; align-items: center; justify-content: center; }
    .qr svg { height: 100%; width: auto; max-width: 100%; aspect-ratio: 1 / 1; display: block; }
    .help { border: 1.2pt dashed #555; border-radius: 2mm; padding: 4mm 5mm; display: flex;
      flex-direction: column; justify-content: center; gap: 2.5mm; font-size: 12pt; line-height: 1.3; }
    .help h2 { margin: 0 0 1mm; font-size: 15pt; }
    .step { display: flex; gap: 3mm; align-items: baseline; }
    .step b { display: inline-block; min-width: 6.5mm; height: 6.5mm; line-height: 6.5mm; text-align: center;
      border-radius: 50%; background: #000; color: #fff; font-size: 11pt; }
    .ft { margin-top: 4mm; padding-top: 2mm; border-top: 0.8pt solid #000; font-size: 9pt; color: #333;
      display: flex; justify-content: space-between; gap: 6mm; }
  </style>
</head>
<body>
<div class="sheet">
  <div class="hd">
    <div>${logo ? `<img src="${logo}" alt="FF Eberstalzell" />` : ""}</div>
    <div>
      <h1>Einsatzbericht<br>Fahrzeug scannen</h1>
      <p>Scanne den Code deines Fahrzeugs — der Einsatzbericht öffnet sich sofort am Handy.</p>
    </div>
  </div>
  <div class="grid">
${zellen}
    <div class="help">
      <h2>So geht’s</h2>
      <div class="step"><b>1</b><span>Handy-Kamera öffnen</span></div>
      <div class="step"><b>2</b><span>Auf den <strong>QR-Code deines Fahrzeugs</strong> halten</span></div>
      <div class="step"><b>3</b><span>Link antippen — du bist direkt im Bericht, ohne PIN</span></div>
      <div style="font-size:10pt;color:#333">Mehrere Handys gleichzeitig sind möglich. Die Position deines Handys wird nicht übertragen.</div>
    </div>
  </div>
  <div class="ft">
    <span>HotDoc · Freiwillige Feuerwehr Eberstalzell</span>
    <span>Nur für Mitglieder · Stand ${esc(stand)}</span>
  </div>
</div>
</body>
</html>`;
}
