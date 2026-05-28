/**
 * Adress-Autocomplete via Photon (Komoot, OpenStreetMap-Daten).
 *
 * Wir proxien die Photon-API durch unser Backend, weil:
 *  - die Tablets im Tailnet hängen und kein direkter externer Internet-
 *    Traffic erwünscht ist (außer durch klar dokumentierte Backend-
 *    Schnittstellen),
 *  - wir einen kleinen In-Memory-Cache haben für wiederholte Tipp-Folgen,
 *  - wir später auf self-hosted Photon umstellen können ohne PWA-Re-Deploy,
 *  - User-Agent-Header an Photon: "HotDoc/1.0 (FF Eberstalzell)" — fair-use-
 *    Identifikation laut Photon-ToS.
 *
 * Bias: Suche ist zentriert auf das FF-Haus (lat/lon-Param) und auf
 * Österreich begrenzt (bbox). Das macht "Solarstr" zu einem Volltreffer
 * auf die Solarstraße in Eberstalzell, statt einer Solarstraße in Berlin.
 *
 * Datenschutz: Adress-Queries gehen ohne PII an Photon (Komoot, EU-DE).
 * Im Logger nur Query-Länge, Cache-Hit-Quote — kein voller Query-String,
 * weil potenziell sensitive Einsatz-Adressen.
 */

import { Router, type RequestHandler } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const geocodeRouter: Router = Router();

const HOME_LAT = 48.0884;
const HOME_LON = 13.9586;
/** Bbox = west,south,east,north — grobe Österreich-Begrenzung. */
const AUSTRIA_BBOX = "9.5,46.3,17.2,49.0";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE = 200;

interface CacheEntry {
  at: number;
  data: GeocodeItem[];
}
const cache = new Map<string, CacheEntry>();

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    state?: string;
    county?: string;
    type?: string;
    osm_value?: string;
  };
}

export interface GeocodeItem {
  /** Hauptzeile — wird ins Einsatzort-Feld übernommen. */
  label: string;
  /** Sekundär-Info, z. B. "Oberösterreich · Bezirk Wels-Land". */
  description?: string;
  lat: number;
  lng: number;
  /** OSM-Type ("house"/"street"/"city"/...) für UI-Icon-Auswahl. */
  osmType?: string;
}

function formatItem(f: PhotonFeature): GeocodeItem | null {
  const c = f.geometry?.coordinates;
  if (!c || typeof c[0] !== "number" || typeof c[1] !== "number") return null;
  const [lng, lat] = c;
  const p = f.properties ?? {};
  const street = p.street ?? p.name ?? "";
  const num = p.housenumber ?? "";
  const plz = p.postcode ?? "";
  const ort = p.city ?? p.town ?? p.village ?? "";
  const streetPart = num ? `${street} ${num}`.trim() : street;
  const main = `${streetPart}${plz || ort ? `, ${plz} ${ort}` : ""}`
    .replace(/^,\s*/, "")
    .trim();
  if (!main) return null;
  const descParts: string[] = [];
  if (p.state) descParts.push(p.state);
  if (p.county && p.county !== p.state) descParts.push(p.county);
  return {
    label: main,
    ...(descParts.length ? { description: descParts.join(" · ") } : {}),
    lat,
    lng,
    ...(p.type ? { osmType: p.type } : {}),
  };
}

geocodeRouter.get("/api/geocode", requireAuth(), (async (req, res) => {
  const qRaw = req.query.q;
  const q = typeof qRaw === "string" ? qRaw.trim() : "";
  if (q.length < 2) {
    res.json({ items: [] });
    return;
  }
  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.json({ items: hit.data, cached: true });
    return;
  }

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("lang", "de");
  url.searchParams.set("limit", "6");
  url.searchParams.set("bbox", AUSTRIA_BBOX);
  url.searchParams.set("lat", String(HOME_LAT));
  url.searchParams.set("lon", String(HOME_LON));

  try {
    const r = await fetch(url.toString(), {
      headers: {
        "User-Agent": "HotDoc/1.0 (FF Eberstalzell)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      logger.warn({ status: r.status, qLen: q.length }, "Photon-Antwort nicht ok");
      res.status(502).json({ error: "geocode_failed", status: r.status });
      return;
    }
    const json = (await r.json()) as { features?: PhotonFeature[] };
    const items = (json.features ?? [])
      .map(formatItem)
      .filter((x): x is GeocodeItem => !!x);

    // FIFO cache eviction
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(cacheKey, { at: Date.now(), data: items });

    res.json({ items, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("aborted") || msg.includes("AbortError");
    logger.warn(
      { msg, isTimeout, qLen: q.length },
      "Geocoding fehlgeschlagen",
    );
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? "geocode_timeout" : "geocode_unreachable",
    });
  }
}) as RequestHandler);
