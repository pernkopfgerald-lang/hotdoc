/**
 * Reverse-Geocoding-Proxy mit Eberstalzell-Gemeinde-Erkennung.
 *
 *   GET /api/geocoding/reverse?lat=48.0884&lng=13.9586
 *     → { ok: true, address: "Bachstraße 5, 4653 Eberstalzell" | null,
 *         inEberstalzell: boolean,
 *         pflichtbereich?: true, einsatzzoneEzell?: true }
 *
 * Backend: Photon (Komoot), gleicher Anbieter wie das Forward-Geocoding
 * in routes/geocode.ts. Kein API-Key noetig, fair-use mit User-Agent.
 *
 * Auto-Pflichtbereich:
 *   Wenn der Punkt innerhalb der Eberstalzell-Bbox liegt, setzt das
 *   Backend pflichtbereich + einsatzzoneEzell auto auf true — der
 *   Florian-Editor uebernimmt die Werte wenn der User sie noch nicht
 *   manuell gesetzt hat.
 *
 * Bbox: lat 48.06 - 48.11, lng 13.91 - 14.01 (grobe Gemeinde-Begrenzung
 * mit etwas Pufferzone — Pflichtbereich-Logik darf grosszuegiger sein
 * als die exakte Gemeindegrenze).
 *
 * Cache: 5 min, 100 m-Raster (3 Nachkommastellen) — vermeidet Photon-Calls
 * fuer fast-identische Positionen aus mehreren Tablet-Pings.
 */

import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const geocodingRouter: Router = Router();

/**
 * Grobe Bounding-Box des Gemeindegebiets Eberstalzell. Anchored um die
 * verifizierte FF-Position (Solarstrasse 1: 48.0396, 13.9927), mit ca.
 * 5 km Puffer in alle Richtungen damit Einsaetze am Gemeinderand auch
 * als "im Pflichtbereich" erkannt werden.
 *
 * Frueher war die Bbox bei 48.06-48.11 — das war 4-5 km zu weit
 * noerdlich (zentriert auf Steinerkirchen/Fischlham statt Eberstalzell).
 */
const EBERSTALZELL_BBOX = {
  latMin: 48.0,
  latMax: 48.08,
  lngMin: 13.93,
  lngMax: 14.04,
};

export function isInEberstalzell(lat: number, lng: number): boolean {
  return (
    lat >= EBERSTALZELL_BBOX.latMin &&
    lat <= EBERSTALZELL_BBOX.latMax &&
    lng >= EBERSTALZELL_BBOX.lngMin &&
    lng <= EBERSTALZELL_BBOX.lngMax
  );
}

interface CachedResult {
  address: string | null;
  ts: number;
}
const cache = new Map<string, CachedResult>();
const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE = 200;

function gridKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

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
  };
}

function formatAddress(f: PhotonFeature): string | null {
  const p = f.properties ?? {};
  const street = p.street ?? "";
  const num = p.housenumber ?? "";
  const plz = p.postcode ?? "";
  const ort = p.city ?? p.town ?? p.village ?? "";
  // Vorzugsweise: Straße + Hausnummer + PLZ + Ort
  if (street) {
    const strNum = num ? `${street} ${num}` : street;
    const plzOrt = plz && ort ? `${plz} ${ort}` : ort || plz;
    return plzOrt ? `${strNum}, ${plzOrt}` : strNum;
  }
  // Fallback: name + Ort (z.B. Autobahn-Knoten oder POI ohne street)
  if (p.name) {
    const plzOrt = plz && ort ? `${plz} ${ort}` : ort || plz;
    return plzOrt ? `${p.name}, ${plzOrt}` : p.name;
  }
  // Letzter Fallback: nur Ort (besser als gar nichts)
  if (ort) {
    return plz ? `${plz} ${ort}` : ort;
  }
  return null;
}

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

geocodingRouter.get("/api/geocoding/reverse", requireAuth(), (async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "bad_request", details: parsed.error.format() });
    return;
  }
  const { lat, lng } = parsed.data;

  const inEberstalzell = isInEberstalzell(lat, lng);
  const autoPflicht = inEberstalzell
    ? { pflichtbereich: true as const, einsatzzoneEzell: true as const }
    : {};

  // Cache-Hit?
  const key = gridKey(lat, lng);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    res.json({
      ok: true,
      address: hit.address,
      inEberstalzell,
      ...autoPflicht,
      cached: true,
    });
    return;
  }

  try {
    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("lang", "de");
    url.searchParams.set("limit", "1");
    const r = await fetch(url.toString(), {
      headers: {
        "User-Agent": "HotDoc/1.0 (FF Eberstalzell)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) {
      logger.warn({ status: r.status, lat, lng }, "Photon-Reverse-Antwort nicht ok");
      res.json({
        ok: true,
        address: null,
        inEberstalzell,
        ...autoPflicht,
        warning: `Photon HTTP ${r.status}`,
      });
      return;
    }
    const json = (await r.json()) as { features?: PhotonFeature[] };
    const f = json.features?.[0];
    const address = f ? formatAddress(f) : null;

    // FIFO cache eviction
    if (cache.size >= MAX_CACHE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(key, { address, ts: Date.now() });

    res.json({
      ok: true,
      address,
      inEberstalzell,
      ...autoPflicht,
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), lat, lng },
      "Reverse-Geocoding-Exception",
    );
    res.json({
      ok: true,
      address: null,
      inEberstalzell,
      ...autoPflicht,
      warning: "Reverse-Geocoding fehlgeschlagen — Bbox-Fallback gilt",
    });
  }
}) as RequestHandler);
