/**
 * Auth-Routes — FR-15.
 *
 * - POST /api/auth/login            Backoffice/Florianstation (Username + Passwort)
 * - GET  /api/auth/me               Token validieren + Benutzer-Info zurück
 * - POST /api/auth/tablet/register  Tablet-Setup (MSISDN + Fahrzeug → DeviceToken)
 * - POST /api/auth/tablet/login     Bestehender Tablet-Token gegen DB validieren
 */

import { randomBytes, randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import {
  LoginRequestSchema,
  TabletRegisterRequestSchema,
  type AuthResponse,
  type Benutzer,
  type TabletAuth,
} from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import { signSession, verifySession } from "../services/auth/jwt.js";
import { verifyPassword } from "../services/auth/password.js";

export const authRouter: Router = Router();

// — POST /api/auth/login —
authRouter.post("/api/auth/login", (async (req, res) => {
  const parsed = LoginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { username, password } = parsed.data;

  const benutzer = await findBenutzerByUsername(username);
  if (!benutzer || !benutzer.aktiv) {
    logger.info({ username }, "Login fehlgeschlagen — Benutzer unbekannt/inaktiv");
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const ok = await verifyPassword(password, benutzer.passwordHash);
  if (!ok) {
    logger.info({ username }, "Login fehlgeschlagen — Passwort falsch");
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const { token, expiresAt } = await signSession({
    sub: benutzer._id,
    username: benutzer.username,
    rolle: benutzer.rolle,
  });

  await db.insert({
    ...benutzer,
    letzterLogin: new Date().toISOString(),
  });

  const response: AuthResponse = {
    ok: true,
    rolle: benutzer.rolle,
    token,
    expiresAt,
    benutzer: {
      username: benutzer.username,
      ...(benutzer.verknuepftePersonId !== undefined
        ? { verknuepftePersonId: benutzer.verknuepftePersonId }
        : {}),
    },
  };
  res.json(response);
}) as RequestHandler);

// — GET /api/auth/me —
authRouter.get("/api/auth/me", (async (req, res) => {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    res.status(401).json({ error: "no_token" });
    return;
  }
  const session = await verifySession(token);
  if (!session) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }
  res.json({
    ok: true,
    rolle: session.rolle,
    username: session.username,
    fahrzeugId: session.fahrzeugId,
  });
}) as RequestHandler);

// — POST /api/auth/tablet/pin-register —
// PIN-basierte Auth pro Fahrzeug (FR-15 Alternative zur MSISDN-Variante).
// Im config:tablet-pins-Doc liegt für jeden Fahrzeug-Slug eine vier-stellige
// PIN. Default beim Bootstrap "1234" — Funktionär ändert sie in der
// Verwaltung/Stammdaten.
authRouter.post("/api/auth/tablet/pin-register", (async (req, res) => {
  const body = req.body as { fahrzeugId?: string; pin?: string; deviceId?: string };
  const fahrzeugId = String(body.fahrzeugId ?? "");
  const pin = String(body.pin ?? "");
  const deviceId = String(body.deviceId ?? randomUUID());

  if (!fahrzeugId || !/^\d{4,6}$/.test(pin)) {
    res.status(400).json({ error: "invalid_body", details: "fahrzeugId + 4-6stellige PIN erforderlich" });
    return;
  }

  const pins = await loadTabletPins();
  const expected = pins[fahrzeugId];
  if (!expected || expected !== pin) {
    logger.info({ fahrzeugId }, "Tablet-PIN-Login fehlgeschlagen");
    res.status(401).json({ error: "invalid_pin" });
    return;
  }

  const { token, expiresAt } = await signSession({
    sub: `tablet:${fahrzeugId}:${deviceId}`,
    username: `tablet:${fahrzeugId}`,
    rolle: "mannschaft",
    fahrzeugId,
  });

  logger.info({ fahrzeugId, deviceId }, "Tablet via PIN registriert");

  const response: AuthResponse = {
    ok: true,
    rolle: "mannschaft",
    token,
    expiresAt,
    fahrzeugId,
  };
  res.json(response);
}) as RequestHandler);

async function loadTabletPins(): Promise<Record<string, string>> {
  const fallback: Record<string, string> = {
    kdo: "1234",
    "tlf-a-4000": "1234",
    "lfa-b": "1234",
    mtf: "1234",
    zentrale: "1234",
  };
  try {
    const doc = (await db.get("config:tablet-pins")) as {
      data?: {
        // Aktuelles Format (config-route): { pins: { kdo: "1234", … } }
        pins?: Record<string, string>;
      } & Record<string, string>;
    };
    if (doc.data?.pins && typeof doc.data.pins === "object") return doc.data.pins;
    // Legacy-Format: data direkt = Map → Backwards-Compat lesen
    if (doc.data && typeof doc.data === "object") {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(doc.data)) {
        if (typeof v === "string") flat[k] = v;
      }
      if (Object.keys(flat).length > 0) return { ...fallback, ...flat };
    }
    return fallback;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      return fallback;
    }
    throw err;
  }
}

// — POST /api/auth/tablet/register —
authRouter.post("/api/auth/tablet/register", (async (req, res) => {
  const parsed = TabletRegisterRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { msisdn, fahrzeugId, deviceId } = parsed.data;

  // Prüfe: existiert bereits eine Registrierung mit dieser MSISDN für ein anderes Tablet?
  const existing = await findTabletByMsisdn(msisdn);
  if (existing && existing.deviceId !== deviceId) {
    logger.warn({ msisdn, fahrzeugId }, "MSISDN bereits an anderes Tablet gebunden — Überschreiben");
  }

  const deviceToken = randomBytes(32).toString("hex");
  const doc: TabletAuth = {
    _id: `tablet:${deviceId}`,
    type: "tablet-auth",
    deviceId,
    msisdn,
    fahrzeugId,
    deviceToken,
    tokenAusgestelltAm: new Date().toISOString(),
    aktiv: true,
  };
  const result = await db.insert({
    ...doc,
    ...(existing ? { _rev: existing._rev } : {}),
  });

  const { token, expiresAt } = await signSession({
    sub: doc._id,
    username: `tablet:${fahrzeugId}`,
    rolle: "mannschaft",
    fahrzeugId,
  });

  logger.info({ fahrzeugId, msisdn, rev: result.rev }, "Tablet registriert");

  const response: AuthResponse = {
    ok: true,
    rolle: "mannschaft",
    token,
    expiresAt,
    fahrzeugId,
  };
  res.json(response);
}) as RequestHandler);

// — Helpers —
function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m?.[1] ?? null;
}

async function findBenutzerByUsername(username: string): Promise<Benutzer | null> {
  try {
    const result = await db.find({
      selector: { type: "benutzer", username },
      limit: 1,
    });
    return (result.docs[0] as Benutzer | undefined) ?? null;
  } catch {
    // Mango index fehlt — Fallback: list all + filter
    const list = await db.list({ startkey: "user:", endkey: "user:￰", include_docs: true });
    const benutzer = list.rows
      .map((r) => r.doc as unknown as Benutzer | undefined)
      .find((d) => d?.username === username);
    return benutzer ?? null;
  }
}

async function findTabletByMsisdn(msisdn: string): Promise<TabletAuth | null> {
  try {
    const result = await db.find({
      selector: { type: "tablet-auth", msisdn },
      limit: 1,
    });
    return (result.docs[0] as TabletAuth | undefined) ?? null;
  } catch {
    return null;
  }
}
