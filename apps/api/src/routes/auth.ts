/**
 * Auth-Routes — FR-15.
 *
 * - POST /api/auth/login                  Backoffice/Florianstation (Username + Passwort)
 * - GET  /api/auth/me                     Token validieren + Benutzer-Info zurück
 * - POST /api/auth/tablet/register        Tablet-Setup (MSISDN + Fahrzeug → DeviceToken)
 * - POST /api/auth/tablet/pin-register    Vereinfachte PIN-Auth pro Fahrzeug
 * - POST /api/auth/handoff/create         QR-Notfall-Übergabe: Erstellt Short-Code
 * - GET  /api/auth/handoff/:code          Claim: liefert neuen Token, invalidiert Tablet
 * - GET  /api/auth/handoff/:code/status   Tablet pollt ob Übergabe erfolgt ist
 */

import { randomBytes, randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import {
  LoginRequestSchema,
  TabletRegisterRequestSchema,
  type AuthResponse,
  type Benutzer,
  type TabletAuth,
} from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import {
  loginRateLimit,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "../lib/rate-limit.js";
import { writeAuditEvent } from "../services/audit.js";
import { signSession, verifySession } from "../services/auth/jwt.js";
import { verifyPassword } from "../services/auth/password.js";

export const authRouter: Router = Router();

// — POST /api/auth/login —
// Rate-Limited: max 5 fehlgeschlagene Versuche pro IP / 15 min → 30 min Sperre
authRouter.post("/api/auth/login", loginRateLimit, (async (req, res) => {
  const parsed = LoginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const { username, password } = parsed.data;

  const benutzer = await findBenutzerByUsername(username);
  if (!benutzer || !benutzer.aktiv) {
    logger.info({ username, ip: req.ip }, "Login fehlgeschlagen — Benutzer unbekannt/inaktiv");
    recordFailedLogin(req);
    await writeAuditEvent({
      type: "login-failed",
      actorUsername: username,
      details: { reason: "unknown_or_inactive" },
      ipAddress: req.ip,
    });
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const ok = await verifyPassword(password, benutzer.passwordHash);
  if (!ok) {
    logger.info({ username, ip: req.ip }, "Login fehlgeschlagen — Passwort falsch");
    recordFailedLogin(req);
    await writeAuditEvent({
      type: "login-failed",
      actorUsername: username,
      details: { reason: "wrong_password" },
      ipAddress: req.ip,
    });
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

  recordSuccessfulLogin(req);
  await writeAuditEvent({
    type: "login-success",
    actorUsername: benutzer.username,
    actorRolle: benutzer.rolle,
    ipAddress: req.ip,
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
authRouter.post("/api/auth/tablet/pin-register", loginRateLimit, (async (req, res) => {
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
    logger.info({ fahrzeugId, ip: req.ip }, "Tablet-PIN-Login fehlgeschlagen");
    recordFailedLogin(req);
    await writeAuditEvent({
      type: "login-failed",
      actorUsername: `tablet:${fahrzeugId}`,
      details: { reason: "wrong_pin" },
      fahrzeugId,
      ipAddress: req.ip,
    });
    res.status(401).json({ error: "invalid_pin" });
    return;
  }

  recordSuccessfulLogin(req);

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

// ─────────────────────────────────────────────────────────────────────
// QR-Handoff — Notfall-Übergabe Tablet → Handy
// ─────────────────────────────────────────────────────────────────────
//
// Flow:
//  1. Tablet ruft `POST /api/auth/handoff/create` (mit aktuellem Tablet-Token)
//     → Server erzeugt 8-Zeichen-Short-Code, speichert handoff-Doc mit
//       neuem JWT-Token-Payload + Tablet-Token-Refs. Ablauf in 5 min.
//  2. Server liefert {code, claimUrl}, der Tablet rendert das als QR.
//  3. Handy scannt → öffnet `https://<pwa>/handoff/<code>`
//     → PWA ruft `GET /api/auth/handoff/<code>`
//     → Server markiert Doc als `claimed=true`, gibt neuen Token zurück.
//  4. Tablet pollt `GET /api/auth/handoff/<code>/status` alle 5 s.
//     Wenn `claimed=true` → Tablet löscht eigenen Token + zeigt PIN-Screen.
//     (Single-Device-Modell, der User wollte das so.)
//
// Sicherheit:
//  - Codes single-use (zweiter Claim → 410 Gone).
//  - 5 Minuten TTL — danach 410 Gone.
//  - Tablet-Token wird in handoff-Doc gespeichert damit der Tablet die
//    eigene Token-ID erkennt (für späteren Server-side-Revoke; für jetzt
//    macht der Tablet-Client den Logout selbst).
//  - Rate-Limit-Plausibilität: 8-Zeichen-Code aus 32 Zeichen Alphabet
//    = 32^8 ≈ 10^12 Permutationen. Brute-Force nicht möglich.

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const HANDOFF_AUTO_RELEASE_DEFAULT_HOURS = 24;
const HANDOFF_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I-Verwechslung
const HANDOFF_CODE_LEN = 8;

function generateHandoffCode(): string {
  const bytes = randomBytes(HANDOFF_CODE_LEN);
  let out = "";
  for (let i = 0; i < HANDOFF_CODE_LEN; i++) {
    const byte = bytes[i] ?? 0;
    out += HANDOFF_CODE_ALPHABET[byte % HANDOFF_CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Liest die konfigurierte Auto-Release-Dauer aus den Stammdaten.
 * Erlaubte Werte: 1 / 4 / 12 / 24 / 48 / 0 (= nie auto-releasen).
 * Default: 24 h.
 */
async function loadHandoffAutoReleaseHours(): Promise<number> {
  try {
    const doc = (await db.get("config:stammdaten")) as {
      data?: { handoffAutoReleaseHours?: number };
    };
    const h = doc.data?.handoffAutoReleaseHours;
    if (typeof h === "number" && Number.isFinite(h) && h >= 0 && h <= 168) {
      return h;
    }
  } catch {
    // Doc fehlt oder nicht lesbar → Default
  }
  return HANDOFF_AUTO_RELEASE_DEFAULT_HOURS;
}

interface HandoffDoc {
  _id: string;
  _rev?: string;
  type: "handoff";
  code: string;
  /** Quell-Tablet — zur Identifikation des zu invalidierenden Tokens. */
  sourceSub: string;
  sourceFahrzeugId?: string;
  sourceUsername: string;
  sourceRolle: Benutzer["rolle"];
  /** Aktiv-Einsatz beim Erstellen — der Empfänger landet darauf. */
  einsatzId?: string;
  /**
   * Reverse-Handoff: das übergebende Gerät war selbst ein Handoff-Empfänger
   * (Handy mit viaHandoff=true) und gibt jetzt zurück ans Tablet. Der
   * Empfänger bekommt einen normalen Token (kein autoReleaseAt, kein viaHandoff).
   */
  isReverseHandoff: boolean;
  /** Wann erstellt. */
  createdAt: string;
  /** Ablauf-Zeitpunkt. */
  expiresAt: string;
  /** Wer hat geclaimt + wann. */
  claimedAt?: string;
  claimedByUserAgent?: string;
  /** Single-Use: nach erstem Claim true. */
  claimed: boolean;
}

const HandoffCreateBodySchema = z.object({
  einsatzId: z.string().optional(),
});

// — POST /api/auth/handoff/create —
authRouter.post("/api/auth/handoff/create", requireAuth(), (async (req, res) => {
  const parsed = HandoffCreateBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const session = req.session!;
  // Wenn die Quell-Sitzung selbst via Handoff entstanden ist (Handy
  // gibt zurück), markieren wir das — der Empfänger bekommt dann einen
  // „normalen" Token ohne autoReleaseAt.
  const isReverseHandoff = session.viaHandoff === true;
  const code = generateHandoffCode();
  const now = new Date();
  const doc: HandoffDoc = {
    _id: `handoff:${code}`,
    type: "handoff",
    code,
    sourceSub: session.sub,
    ...(session.fahrzeugId ? { sourceFahrzeugId: session.fahrzeugId } : {}),
    sourceUsername: session.username,
    sourceRolle: session.rolle,
    ...(parsed.data.einsatzId ? { einsatzId: parsed.data.einsatzId } : {}),
    isReverseHandoff,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS).toISOString(),
    claimed: false,
  };
  try {
    await db.insert(doc);
  } catch (err) {
    // Sehr unwahrscheinlich (Collision in 32^8) — einmaliger Retry mit neuem Code
    if ((err as { statusCode?: number }).statusCode === 409) {
      const retryCode = generateHandoffCode();
      doc._id = `handoff:${retryCode}`;
      doc.code = retryCode;
      await db.insert(doc);
    } else {
      throw err;
    }
  }
  // Audit-Event-Doc
  await writeAuditEvent({
    type: isReverseHandoff ? "handoff-reverse-create" : "handoff-create",
    code: doc.code,
    fahrzeugId: session.fahrzeugId,
    actorUsername: session.username,
    actorRolle: session.rolle,
    einsatzId: parsed.data.einsatzId,
  });
  logger.info(
    {
      code: doc.code,
      by: session.username,
      fahrzeug: session.fahrzeugId,
      einsatzId: parsed.data.einsatzId,
      isReverseHandoff,
    },
    isReverseHandoff ? "Reverse-Handoff-Code erstellt (Handy → Tablet)" : "Handoff-Code erstellt",
  );
  res.json({
    ok: true,
    code: doc.code,
    expiresAt: doc.expiresAt,
    ttlSeconds: HANDOFF_TTL_MS / 1000,
    isReverseHandoff,
  });
}) as RequestHandler);

// — GET /api/auth/handoff/:code — Claim
// Public-Endpoint, aber jeder gültige Claim verlangt Vorwissen des Codes.
// Der Code wird single-use: zweiter Claim liefert 410 Gone.
authRouter.get("/api/auth/handoff/:code", (async (req, res) => {
  const code = String(req.params.code ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    res.status(400).json({ error: "invalid_code_format" });
    return;
  }
  let doc: HandoffDoc;
  try {
    doc = (await db.get(`handoff:${code}`)) as HandoffDoc;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "code_not_found" });
      return;
    }
    throw err;
  }
  if (doc.claimed) {
    res.status(410).json({ error: "already_claimed", claimedAt: doc.claimedAt });
    return;
  }
  if (new Date(doc.expiresAt).getTime() < Date.now()) {
    res.status(410).json({ error: "expired", expiresAt: doc.expiresAt });
    return;
  }

  // Markiere als claimed (idempotent: weitere Aufrufe → 410)
  const ua = String(req.headers["user-agent"] ?? "").slice(0, 200);
  const claimedAt = new Date().toISOString();
  const updated: HandoffDoc = {
    ...doc,
    claimed: true,
    claimedAt,
    claimedByUserAgent: ua,
  };
  try {
    await db.insert(updated);
  } catch (err) {
    // Konkurrierende Claims — wer das Update schreibt, gewinnt; wer 409 bekommt verliert.
    if ((err as { statusCode?: number }).statusCode === 409) {
      res.status(410).json({ error: "race_lost_already_claimed" });
      return;
    }
    throw err;
  }

  // Neuen JWT-Token für das übernehmende Gerät ausstellen.
  //
  // Reverse-Handoff (Handy → Tablet zurück): KEIN autoReleaseAt, KEIN viaHandoff —
  // das Tablet bekommt einen ganz normalen Sitzungs-Token zurück.
  //
  // Forward-Handoff (Tablet → Handy): autoReleaseAt = jetzt + N Stunden
  // (N kommt aus Stammdaten, Default 24). N=0 bedeutet „kein Auto-Release".
  let autoReleaseAt: string | undefined;
  const signOpts: { autoReleaseAt?: string; viaHandoff?: boolean } = {};
  if (!doc.isReverseHandoff) {
    const hours = await loadHandoffAutoReleaseHours();
    if (hours > 0) {
      autoReleaseAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      signOpts.autoReleaseAt = autoReleaseAt;
    }
    signOpts.viaHandoff = true;
  }
  const { token, expiresAt } = await signSession(
    {
      sub: doc.sourceSub,
      username: doc.sourceUsername,
      rolle: doc.sourceRolle,
      ...(doc.sourceFahrzeugId ? { fahrzeugId: doc.sourceFahrzeugId } : {}),
    },
    signOpts,
  );

  await writeAuditEvent({
    type: doc.isReverseHandoff ? "handoff-reverse-claim" : "handoff-claim",
    code,
    fahrzeugId: doc.sourceFahrzeugId,
    actorUsername: doc.sourceUsername,
    actorRolle: doc.sourceRolle,
    einsatzId: doc.einsatzId,
    userAgent: ua.slice(0, 200),
    autoReleaseAt,
  });

  logger.warn(
    {
      code,
      from: doc.sourceUsername,
      fahrzeug: doc.sourceFahrzeugId,
      einsatzId: doc.einsatzId,
      autoReleaseAt: autoReleaseAt ?? "nie",
      isReverseHandoff: doc.isReverseHandoff,
      ua: ua.slice(0, 60),
    },
    doc.isReverseHandoff
      ? "Reverse-Handoff geclaimt — Tablet übernimmt Sitzung als normaler Token"
      : "Handoff geclaimt — Quell-Tablet sollte sich selbst ausloggen",
  );

  res.json({
    ok: true,
    token,
    expiresAt,
    ...(autoReleaseAt ? { autoReleaseAt } : {}),
    viaHandoff: !doc.isReverseHandoff,
    isReverseHandoff: doc.isReverseHandoff,
    rolle: doc.sourceRolle,
    ...(doc.sourceFahrzeugId ? { fahrzeugId: doc.sourceFahrzeugId } : {}),
    ...(doc.einsatzId ? { einsatzId: doc.einsatzId } : {}),
  });
}) as RequestHandler);

// — POST /api/auth/handoff/release —
// Manuelles „Sitzung freigeben" am Handy. Rein semantisch + Audit-Trail:
// das Handy clearrt seinen Token sowieso clientseitig. Diese Route ist
// nur dazu da damit der Server im Log sieht „Sitzung am Handy freigegeben"
// und für spätere Multi-Device-Awareness-Features (Push an Tablets).
//
// Verlangt einen aktuell-gültigen Token (requireAuth) — Anonyme können
// nicht fremde Handoffs „beenden", auch wenn sie eh keine Auswirkung
// hätten.
authRouter.post("/api/auth/handoff/release", requireAuth(), (async (req, res) => {
  const session = req.session!;
  await writeAuditEvent({
    type: "handoff-release",
    actorUsername: session.username,
    actorRolle: session.rolle,
    fahrzeugId: session.fahrzeugId,
    details: { viaHandoff: session.viaHandoff === true },
  });
  logger.info(
    {
      by: session.username,
      fahrzeug: session.fahrzeugId,
      viaHandoff: session.viaHandoff === true,
      autoReleaseAt: session.autoReleaseAt,
    },
    "Sitzung manuell freigegeben",
  );
  res.json({ ok: true, releasedAt: new Date().toISOString() });
}) as RequestHandler);

// — GET /api/auth/handoff/:code/status —
// Tablet pollt diese Route alle 5 s. Sobald der Claim erfolgt ist,
// sendet das Tablet sich selbst in den Logout.
authRouter.get("/api/auth/handoff/:code/status", (async (req, res) => {
  const code = String(req.params.code ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]{8}$/.test(code)) {
    res.status(400).json({ error: "invalid_code_format" });
    return;
  }
  try {
    const doc = (await db.get(`handoff:${code}`)) as HandoffDoc;
    const expired = new Date(doc.expiresAt).getTime() < Date.now();
    res.json({
      ok: true,
      claimed: !!doc.claimed,
      expired,
      claimedAt: doc.claimedAt,
      expiresAt: doc.expiresAt,
    });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "code_not_found" });
      return;
    }
    throw err;
  }
}) as RequestHandler);
