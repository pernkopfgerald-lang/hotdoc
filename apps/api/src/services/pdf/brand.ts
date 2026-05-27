/**
 * FF-Eberstalzell-Logo als data-URL für PDF-Einbettung.
 *
 * Wir laden die offizielle Logo-Datei einmalig beim API-Start und cachen
 * sie als base64-encodete data-URL. Puppeteer kann diese direkt im
 * `<img src=…>`-Tag rendern ohne separates HTTP-Asset-Fetching.
 *
 * Quelle: `apps/api/assets/ff-eberstalzell-logo.png` (im Repo committed).
 * Wenn die Datei fehlt → leerer String, PDF rendert ohne Logo (better
 * than fake-logo).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { logger } from "../../lib/logger.js";

const here = dirname(fileURLToPath(import.meta.url));
// In dist liegt das compilierte File unter apps/api/dist/services/pdf/.
// Wir gehen 3 Ebenen hoch zu apps/api/ und von dort in assets/.
const LOGO_PATH = join(here, "..", "..", "..", "assets", "ff-eberstalzell-logo.png");

let cachedDataUrl: string | null = null;

export function getBrandLogoDataUrl(): string {
  if (cachedDataUrl !== null) return cachedDataUrl;
  try {
    const buf = readFileSync(LOGO_PATH);
    cachedDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    logger.info({ bytes: buf.length, path: LOGO_PATH }, "FF-Eberstalzell-Logo geladen");
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), path: LOGO_PATH },
      "Logo-Datei nicht gefunden — PDF rendert ohne Logo",
    );
    cachedDataUrl = "";
  }
  return cachedDataUrl;
}
