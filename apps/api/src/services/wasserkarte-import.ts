/**
 * Import von wasserkarte.info-KML-Exporten (Löschwasser-Entnahmestellen).
 *
 * Hintergrund: wasserkarte.info bietet keine oeffentliche Live-API/kein
 * Embed fuer Fremdsysteme (docs.wasserkarte.info -> "Externe Systeme" listet
 * nur eine kuratierte Partner-Schnittstelle mit Zugriffsschluesseln fuer
 * benannte Alarmierungssysteme; Detail-Links verlangen Login). Oeffentlich
 * erreichbar sind nur die pro Objekt gerenderten Marker-Icons
 * (portal.wasserkarte.info/m/<id>_1.png) — die tragen Zufluss (l/min) und
 * Nennweite direkt als Pixel-Grafik im offiziellen Symbol-Design.
 *
 * Deshalb: Funktionaere exportieren die KML manuell bei wasserkarte.info
 * (alle paar Monate, wenn sich Entnahmestellen aendern) und laden sie im
 * Backoffice hoch (Verwaltung > Stammdaten > Löschwasser). Dieser Service
 * parst die KML und laedt die Icons serverseitig herunter — die Route
 * (routes/wasserquellen.ts) ersetzt damit den kompletten Datenbestand.
 *
 * Reine Regex-Parsing ohne XML-Bibliothek (keine neue npm-Abhaengigkeit) —
 * das KML-Format von wasserkarte.info ist einfach genug (siehe Beispiel-
 * Placemark unten) und stabil.
 */

export interface ParsedWasserquelle {
  id: string;
  name: string;
  typ: "H" | "S" | "T";
  typLabel: string;
  anschluss: string;
  lat: number;
  lng: number;
  iconSrcUrl: string;
}

// Grobe Kategorie fuer Rueckwaerts-Kompatibilitaet mit dem PWA-seitigen
// Hydrant["typ"]-Feld ("H" | "S" | "T") — nur Fallback-Badge falls kein Icon.
const TYP_BUCKET: Record<string, "H" | "S" | "T"> = {
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

const ENTITIES: Record<string, string> = {
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&#39;": "'",
};

function decodeEntities(str: string): string {
  return str.replace(/&quot;|&apos;|&amp;|&lt;|&gt;|&#39;/g, (m) => ENTITIES[m] ?? m);
}

/**
 * Beispiel-Placemark aus einem wasserkarte.info-KML-Export:
 *
 * <Placemark>
 *   <name> Löschbehälter neben Feuerwehrhaus (# 001)</name>
 *   <description><![CDATA[Löschbehälter ... (# 001)<br />Löschwasserbehälter<br />2x A<br />
 *     <a href="https://portal.wasserkarte.info/watermap/waterSource/477475">Details</a>]]></description>
 *   <Point><coordinates>13.9887124, 48.0118639, 0</coordinates></Point>
 *   <Style><IconStyle><Icon><href>https://portal.wasserkarte.info/m/477475_1.png</href></Icon></IconStyle></Style>
 * </Placemark>
 */
export function parseWasserkarteKml(text: string): ParsedWasserquelle[] {
  const blocks = [...text.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)].map((m) => m[1] ?? "");
  const out: ParsedWasserquelle[] = [];
  for (const b of blocks) {
    const nameM = b.match(/<name>(.*?)<\/name>/);
    const cdataM = b.match(/<!\[CDATA\[(.*?)\]\]>/s);
    const iconM = b.match(/<href>(.*?)<\/href>/);
    const coordM = b.match(/<coordinates>(.*?)<\/coordinates>/);
    if (!nameM || !cdataM || !iconM || !coordM) continue;

    const cdata = cdataM[1] ?? "";
    const parts = cdata.split("<br />");
    const typLabel = decodeEntities((parts[1] ?? "").trim());
    const anschluss = decodeEntities((parts[2] ?? "").trim());
    const idM = cdata.match(/waterSource\/(\d+)/);
    if (!idM?.[1]) continue;

    const coordParts = (coordM[1] ?? "").trim().split(",").map((s) => s.trim());
    const lat = Number.parseFloat(coordParts[1] ?? "");
    const lng = Number.parseFloat(coordParts[0] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    out.push({
      id: idM[1],
      name: decodeEntities(nameM[1]?.trim() ?? ""),
      typ: TYP_BUCKET[typLabel] ?? "T",
      typLabel: typLabel || "Wasserentnahmestelle",
      anschluss,
      lat,
      lng,
      iconSrcUrl: iconM[1]?.trim() ?? "",
    });
  }
  return out;
}

/** Laedt ein Icon-PNG von portal.wasserkarte.info (oeffentlich, kein Login). */
export async function downloadIconBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}

/** Concurrency-begrenzter Download aller Icons — 346 sequentielle Requests
 *  waeren zu langsam fuer einen einzelnen Admin-Request. */
export async function downloadIconsConcurrent(
  items: ParsedWasserquelle[],
  concurrency = 16,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const queue = [...items];
  async function worker(): Promise<void> {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const b64 = await downloadIconBase64(item.iconSrcUrl);
      if (b64) result.set(item.id, b64);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}
