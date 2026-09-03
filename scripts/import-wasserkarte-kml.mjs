#!/usr/bin/env node
/**
 * Importiert eine von wasserkarte.info exportierte KML-Datei
 * (Loeschwasserentnahmestellen) in das lokale, statische Datenformat der PWA.
 *
 * wasserkarte.info bietet keine oeffentliche API/kein Embed (siehe
 * docs.wasserkarte.info -> "Externe Systeme": nur eine kuratierte
 * Partner-Liste mit Zugriffsschluesseln fuer benannte Systeme, HotDoc ist
 * dort nicht gelistet; Detail-Links wie /watermap/waterSource/<id> verlangen
 * Login). Der einzig oeffentlich nutzbare Bestandteil sind die pro Objekt
 * gerenderten Marker-Icons (https://portal.wasserkarte.info/m/<id>_1.png) --
 * die sind ohne Login abrufbar UND tragen die Kennzahlen (Zufluss l/min,
 * Nennweite, Kapazitaet, Saugleitungslaenge/-hoehe) direkt als Pixel-Grafik,
 * exakt im offiziellen wasserkarte.info-Symbol-Design.
 *
 * Deshalb: einmaliger Import (kein Laufzeit-Abhaengigkeit von
 * wasserkarte.info) -- Icons werden lokal gebuendelt, damit die Karte auch
 * ohne Verbindung zu wasserkarte.info funktioniert (Robustheits-Prinzip).
 *
 * Erneuter Import bei Aenderungen der Wasserentnahmestellen: User exportiert
 * frische KML aus wasserkarte.info, dieses Skript erneut mit dem neuen Pfad
 * ausfuehren -- ueberschreibt quellen.json + icons/ vollstaendig.
 *
 * Nutzung:
 *   node scripts/import-wasserkarte-kml.mjs <pfad-zur-kml-datei>
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "apps", "pwa", "public", "wasserkarte");
const ICONS_DIR = join(OUT_DIR, "icons");

// Grobe Kategorie fuer Rueckwaerts-Kompatibilitaet mit dem bestehenden
// Hydrant["typ"]-Feld ("H" | "S" | "T") in MapCard.tsx -- wird nur als
// Fallback-Badge genutzt, wenn aus irgendeinem Grund kein Icon-Bild da ist.
const TYP_BUCKET = {
  "Überflurhydrant": "H",
  "Unterflurhydrant": "H",
  "Wandhydrant": "H",
  "Saugstelle": "S",
  "Bach mit Stau": "S",
  "Löschwasserbrunnen": "S",
  "Löschwasserbehälter": "T",
  "Löschwasserteich": "T",
  "Naturteich": "T",
  "Schwimmteich": "T",
  "Schwimmbad": "T",
  "Regenwassertank": "T",
  "Steigleitung": "T",
};

const ENTITIES = {
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
};

function decodeEntities(str) {
  return str.replace(/&quot;|&apos;|&amp;|&lt;|&gt;|&#39;/g, (m) => ENTITIES[m] ?? m);
}

function parseKml(text) {
  const blocks = [...text.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map((m) => m[1]);
  const out = [];
  for (const b of blocks) {
    const nameM = b.match(/<name>(.*?)<\/name>/);
    const cdataM = b.match(/<!\[CDATA\[(.*?)\]\]>/s);
    const iconM = b.match(/<href>(.*?)<\/href>/);
    const coordM = b.match(/<coordinates>(.*?)<\/coordinates>/);
    if (!nameM || !cdataM || !iconM || !coordM) continue;

    const cdata = cdataM[1];
    const parts = cdata.split("<br />");
    const typLabel = decodeEntities((parts[1] ?? "").trim());
    const anschluss = decodeEntities((parts[2] ?? "").trim());
    const idM = cdata.match(/waterSource\/(\d+)/);
    if (!idM) continue;

    const [lonStr, latStr] = coordM[1].trim().split(",").map((s) => s.trim());
    const lat = Number.parseFloat(latStr);
    const lng = Number.parseFloat(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    out.push({
      id: idM[1],
      name: decodeEntities(nameM[1].trim()),
      typ: TYP_BUCKET[typLabel] ?? "T",
      typLabel: typLabel || "Wasserentnahmestelle",
      anschluss,
      lat,
      lng,
      icon: `${idM[1]}.png`,
      iconSrcUrl: iconM[1].trim(),
    });
  }
  return out;
}

async function downloadIcons(quellen, concurrency = 10) {
  mkdirSync(ICONS_DIR, { recursive: true });
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  const queue = [...quellen];

  async function worker() {
    for (;;) {
      const q = queue.shift();
      if (!q) return;
      const dest = join(ICONS_DIR, q.icon);
      if (existsSync(dest)) {
        skipped += 1;
        continue;
      }
      try {
        const res = await fetch(q.iconSrcUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        writeFileSync(dest, buf);
        ok += 1;
      } catch (err) {
        failed += 1;
        console.warn(`  Icon fehlgeschlagen (${q.id}): ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return { ok, failed, skipped };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Nutzung: node scripts/import-wasserkarte-kml.mjs <pfad-zur-kml-datei>");
    process.exit(1);
  }
  const text = readFileSync(inputPath, "utf-8");
  const parsed = parseKml(text);
  console.log(`Geparst: ${parsed.length} Wasserentnahmestellen`);

  const byType = {};
  for (const q of parsed) byType[q.typLabel] = (byType[q.typLabel] ?? 0) + 1;
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}x ${t}`);
  }

  console.log("Lade Icons von portal.wasserkarte.info (einmalig, oeffentlich, ohne Login)...");
  const { ok, failed, skipped } = await downloadIcons(parsed);
  console.log(`Icons: ${ok} neu, ${skipped} bereits vorhanden, ${failed} fehlgeschlagen`);

  mkdirSync(OUT_DIR, { recursive: true });
  const json = parsed.map(({ iconSrcUrl, ...rest }) => rest);
  const outPath = join(OUT_DIR, "quellen.json");
  writeFileSync(outPath, JSON.stringify(json), "utf-8");
  console.log(`Geschrieben: ${outPath} (${json.length} Eintraege)`);

  if (failed > 0) {
    console.warn(
      `ACHTUNG: ${failed} Icon(s) konnten nicht geladen werden -- diese Objekte fallen in ` +
        `MapCard auf die generische H/S/T-Badge zurueck (kein App-Fehler, nur weniger Detail).`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
