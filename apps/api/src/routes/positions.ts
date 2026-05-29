/**
 * Live-Position-Endpoints für die Fahrzeuge.
 *
 *  - POST /api/positions   Tablet sendet seine aktuelle GPS-Position
 *                          (alle 3-5 s). FahrzeugId kommt aus dem Session-
 *                          Token, nicht aus dem Body — Spoofing-Schutz.
 *
 *  - GET  /api/positions   Liefert die letzten bekannten Pings aller
 *                          Fahrzeuge. Wird von der Florianstation alle 3 s
 *                          gepollt. Pings älter als 5 min werden serverseitig
 *                          aussortiert.
 *
 * Datenschutz: Position = PII. Wir halten nur den letzten Ping pro Fahrzeug
 * im RAM, ohne Persistierung. Audit-Events werden bewusst NICHT geschrieben
 * (zu hohe Frequenz und der eigentliche Wert ist die Karte, nicht der Log).
 */

import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth-middleware.js";
import {
  evictOlderThan,
  getAllPings,
  setPing,
  type FahrzeugPing,
} from "../services/positions-state.js";

export const positionsRouter: Router = Router();

const PingBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().nonnegative().optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracyM: z.number().nonnegative().optional(),
});

/** Stale-Cutoff für die Listen-Antwort. 5 min ohne Ping → Fahrzeug fällt raus. */
const MAX_PING_AGE_MS = 5 * 60 * 1000;

// — POST /api/positions —
// Auth-Pflicht. fahrzeugId wird aus session genommen — der Tablet-Client
// kann sich nicht als ein anderes Fahrzeug ausgeben.
positionsRouter.post("/api/positions", requireAuth(), (async (req, res) => {
  const session = req.session;
  if (!session?.fahrzeugId) {
    res.status(403).json({ error: "no_fahrzeug_in_session" });
    return;
  }
  const parsed = PingBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  // Zentrale schickt keine Pings (ist immer am FF-Haus, hartcodiert im Frontend).
  if (session.fahrzeugId === "zentrale") {
    res.json({ ok: true, ignored: true });
    return;
  }
  const ping: FahrzeugPing = {
    fahrzeugId: session.fahrzeugId as FahrzeugPing["fahrzeugId"],
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    ts: new Date().toISOString(),
    ...(parsed.data.speed !== undefined ? { speed: parsed.data.speed } : {}),
    ...(parsed.data.heading !== undefined ? { heading: parsed.data.heading } : {}),
    ...(parsed.data.accuracyM !== undefined
      ? { accuracyM: parsed.data.accuracyM }
      : {}),
  };
  setPing(ping);
  res.json({ ok: true });
}) as RequestHandler);

// — GET /api/positions —
// Florianstation und Fahrzeug-Tablets dürfen lesen (Cross-Awareness).
positionsRouter.get("/api/positions", requireAuth(), (async (_req, res) => {
  evictOlderThan(MAX_PING_AGE_MS);
  const items = getAllPings();
  res.json({ ok: true, items });
}) as RequestHandler);
