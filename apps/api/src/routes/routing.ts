/**
 * GraphHopper-Routing-Proxy mit In-Memory-Cache.
 *
 * Warum Proxy: Der GRAPHHOPPER_API_KEY darf nicht ins Browser-Bundle.
 * Tablets fragen `/api/routing/route?fromLat=...&fromLng=...&toLat=...&toLng=...`
 * → Backend macht den HTTPS-Call mit dem Key in fly secrets.
 *
 * Cache-Strategie (Free Plan = 500 Credits/Tag):
 *  - Key wird auf 3 Nachkommastellen gerundet (≈ 100 m Raster)
 *  - TTL 5 min — länger reicht für die Anfahrt, kürzer um manche Strassen-
 *    sperre nicht zu lange auszublenden
 *  - Heisst: 4 Fahrzeuge zum gleichen Einsatzort, alle in 100 m-Sektoren
 *    rund um die Wache → 1-4 Calls statt 4 × (Polling-Intervall)
 *
 * Routenformat:
 *  - path: Array von {lat,lng} (für Leaflet-Polyline)
 *  - distanceM, timeMs (Header der Karte)
 *  - instructions: [{text, distanceM, sign}] für Turn-by-Turn-Sidebar
 */

import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const routingRouter: Router = Router();

interface CachedRoute {
  path: Array<{ lat: number; lng: number }>;
  distanceM: number;
  timeMs: number;
  instructions: Array<{
    text: string;
    distanceM: number;
    timeMs: number;
    sign: number;
  }>;
  ts: number;
}

const cache = new Map<string, CachedRoute>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const COORD_PRECISION = 3;
const CACHE_MAX_SIZE = 200;

function roundCoord(n: number): string {
  return n.toFixed(COORD_PRECISION);
}

function cacheKey(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): string {
  return `${roundCoord(fromLat)},${roundCoord(fromLng)}_${roundCoord(toLat)},${roundCoord(toLng)}`;
}

function evictExpired(): void {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (now - v.ts > CACHE_TTL_MS) cache.delete(k);
  }
}

const QuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
});

routingRouter.get("/api/routing/route", requireAuth(), (async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "invalid_query", details: parsed.error.flatten() });
    return;
  }
  if (!env.GRAPHHOPPER_API_KEY) {
    res.status(503).json({
      error: "routing_disabled",
      message: "GRAPHHOPPER_API_KEY nicht gesetzt — Routing ist deaktiviert.",
    });
    return;
  }
  const { fromLat, fromLng, toLat, toLng } = parsed.data;
  const key = cacheKey(fromLat, fromLng, toLat, toLng);

  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.json({ ok: true, cached: true, ...cached });
    return;
  }

  try {
    const url = new URL(`${env.GRAPHHOPPER_BASE_URL}/route`);
    url.searchParams.append("point", `${fromLat},${fromLng}`);
    url.searchParams.append("point", `${toLat},${toLng}`);
    url.searchParams.set("profile", "car");
    url.searchParams.set("locale", "de");
    url.searchParams.set("instructions", "true");
    url.searchParams.set("points_encoded", "false");
    url.searchParams.set("key", env.GRAPHHOPPER_API_KEY);

    const ghRes = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });
    if (!ghRes.ok) {
      const text = await ghRes.text();
      logger.warn(
        { status: ghRes.status, body: text.slice(0, 300) },
        "GraphHopper-Routing-Fehler",
      );
      res.status(502).json({
        error: "graphhopper_error",
        status: ghRes.status,
        message: text.slice(0, 300),
      });
      return;
    }
    const data = (await ghRes.json()) as {
      paths?: Array<{
        distance?: number;
        time?: number;
        points?: { coordinates?: Array<[number, number]> };
        instructions?: Array<{
          text?: string;
          distance?: number;
          time?: number;
          sign?: number;
        }>;
      }>;
    };
    const p = data.paths?.[0];
    if (!p) {
      res.status(502).json({ error: "no_route_found" });
      return;
    }
    const entry: CachedRoute = {
      path: (p.points?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng })),
      distanceM: p.distance ?? 0,
      timeMs: p.time ?? 0,
      instructions: (p.instructions ?? []).map((ins) => ({
        text: ins.text ?? "",
        distanceM: ins.distance ?? 0,
        timeMs: ins.time ?? 0,
        sign: ins.sign ?? 0,
      })),
      ts: Date.now(),
    };
    cache.set(key, entry);
    if (cache.size > CACHE_MAX_SIZE) evictExpired();
    res.json({ ok: true, cached: false, ...entry });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      "GraphHopper-Route fehlgeschlagen",
    );
    res.status(502).json({
      error: "graphhopper_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
}) as RequestHandler);
