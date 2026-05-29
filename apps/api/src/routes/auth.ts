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
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import {
  LoginRequestSchema,
  TabletRegisterRequestSchema,
  type AuthResponse,
  type Benutzer,
  type TabletAuth,
} from "@hotdoc/shared";
import { env } from "../config.js";
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
// Tablet-Setup pro Fahrzeug. Body braucht nur { fahrzeugId, deviceId? }.
// Name historisch — PIN ist seit der QR-Sticker-Einführung tot. Falls
// jemand noch ein altes PIN-Feld mitschickt, wird es ignoriert (keine
// Validierung, keine Prüfung).
//
// Zugriffsschutz läuft jetzt über die Netzwerk-Ebene (Tailscale / LAN /
// QR-Sticker pro Fahrzeug), nicht mehr über Tipp-PINs. Rate-Limit bleibt
// als Defence-in-Depth aktiv.
authRouter.post("/api/auth/tablet/pin-register", loginRateLimit, (async (req, res) => {
  const body = req.body as { fahrzeugId?: string; deviceId?: string };
  const fahrzeugId = String(body.fahrzeugId ?? "");
  const deviceId = String(body.deviceId ?? randomUUID());

  if (!/^(kdo|tlf-a-4000|lfa-b|mtf|zentrale)$/.test(fahrzeugId)) {
    res.status(400).json({ error: "invalid_body", details: "fahrzeugId erforderlich" });
    return;
  }

  recordSuccessfulLogin(req);

  // Rollen-Mapping pro Fahrzeug:
  //   - "zentrale" (Florianstation/PC) → einsatzleiter (darf abschließen + Einsatz-Felder editieren)
  //   - alle anderen Fahrzeug-Tablets → mannschaft (darf nur eigenen Fahrzeugbericht)
  // Begründung: das Florian-Gerät steht im FF-Haus, wird vom diensthabenden
  // Einsatzleiter bedient. Höhere Rechte sind dort organisatorisch gedeckt.
  const rolle = fahrzeugId === "zentrale" ? "einsatzleiter" : "mannschaft";

  const { token, expiresAt } = await signSession({
    sub: `tablet:${fahrzeugId}:${deviceId}`,
    username: `tablet:${fahrzeugId}`,
    rolle,
    fahrzeugId,
  });

  logger.info({ fahrzeugId, deviceId, rolle }, "Tablet registriert (PIN-los)");
  await writeAuditEvent({
    type: "login-success",
    actorUsername: `tablet:${fahrzeugId}`,
    actorRolle: rolle,
    fahrzeugId,
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200),
    details: { via: "pin-register" },
    ipAddress: req.ip,
  });

  const response: AuthResponse = {
    ok: true,
    rolle,
    token,
    expiresAt,
    fahrzeugId,
  };
  res.json(response);
}) as RequestHandler);

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

// ─────────────────────────────────────────────────────────────────────
// QR-Sticker-Auth — persistente fahrzeug-spezifische Login-Anker
// ─────────────────────────────────────────────────────────────────────
//
// Konzept:
//   Funktionär druckt im Backoffice einen QR-Code pro Fahrzeug und klebt
//   ihn ans Tablet oder ins Auto-Cockpit. Der QR enthält die URL
//     https://hotdoc-eberstalzell.fly.dev/qr/<token>
//   mit einem signierten JWT als <token>.
//   Wer den QR scannt → öffnet die URL → PWA macht GET /api/auth/qr/<token>
//   → bekommt einen normalen Tablet-Session-Token + ist sofort drin.
//
// Multi-Device-Parallel:
//   Mehrere Geräte können denselben QR scannen — jeder Scan = neue Tablet-
//   Session mit eigener deviceId. Kein Single-Device-Logout (anders als
//   QR-Handoff, der eine Sitzung übergibt).
//
// Rotation:
//   Bei Tablet-Verlust / Verdacht auf QR-Fotokopie rotiert der Funktionär
//   im Backoffice → die generation im config:qr-anchors-Doc geht +1, der
//   alte QR ist tot, neuer muss gedruckt werden.

const QR_ANCHOR_CONFIG_ID = "config:qr-anchors";
const QR_KIND = "qr-anchor";

interface QrAnchorPayload {
  kind: typeof QR_KIND;
  fahrzeugId: string;
  generation: number;
  iat: number;
}

interface QrAnchorState {
  byFahrzeug: Record<string, { generation: number; geaendertAm: string; geaendertVon?: string }>;
}

async function loadQrAnchorState(): Promise<QrAnchorState> {
  try {
    const doc = (await db.get(QR_ANCHOR_CONFIG_ID)) as { byFahrzeug?: QrAnchorState["byFahrzeug"] };
    return { byFahrzeug: doc.byFahrzeug ?? {} };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      return { byFahrzeug: {} };
    }
    throw err;
  }
}

async function getCurrentGeneration(fahrzeugId: string): Promise<number> {
  const state = await loadQrAnchorState();
  return state.byFahrzeug[fahrzeugId]?.generation ?? 1;
}

const QR_SECRET_BYTES = new TextEncoder().encode(env.JWT_SECRET);

async function signQrAnchor(fahrzeugId: string, generation: number): Promise<string> {
  // KEIN exp — QR ist persistent. Invalidierung läuft über generation-Bump.
  return await new SignJWT({
    kind: QR_KIND,
    fahrzeugId,
    generation,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(QR_SECRET_BYTES);
}

async function verifyQrAnchor(token: string): Promise<QrAnchorPayload | null> {
  try {
    const { payload } = await jwtVerify(token, QR_SECRET_BYTES);
    if (payload.kind !== QR_KIND) return null;
    if (typeof payload.fahrzeugId !== "string") return null;
    if (typeof payload.generation !== "number") return null;
    if (typeof payload.iat !== "number") return null;
    return payload as unknown as QrAnchorPayload;
  } catch {
    return null;
  }
}

// — GET /api/auth/qr-anchor/:fahrzeugId —
// Liefert den aktuell gültigen QR-Token-String für den Backoffice-QR-Modal.
// Nur funktionaer+ — der String darf nicht für jeden lesbar sein.
authRouter.get("/api/auth/qr-anchor/:fahrzeugId", requireAuth("funktionaer"), (async (req, res) => {
  const fahrzeugId = String(req.params.fahrzeugId ?? "");
  if (!/^[a-z0-9-]{1,32}$/.test(fahrzeugId)) {
    res.status(400).json({ error: "invalid_fahrzeugId" });
    return;
  }
  const generation = await getCurrentGeneration(fahrzeugId);
  const token = await signQrAnchor(fahrzeugId, generation);
  res.json({ ok: true, token, fahrzeugId, generation });
}) as RequestHandler);

// — POST /api/auth/qr-anchor/:fahrzeugId/rotate —
// Erhöht die Generation im config:qr-anchors-Doc → alle bisherigen QR-Codes
// für dieses Fahrzeug werden ungültig. Funktionär muss neuen QR drucken.
authRouter.post(
  "/api/auth/qr-anchor/:fahrzeugId/rotate",
  requireAuth("funktionaer"),
  (async (req, res) => {
    const fahrzeugId = String(req.params.fahrzeugId ?? "");
    if (!/^[a-z0-9-]{1,32}$/.test(fahrzeugId)) {
      res.status(400).json({ error: "invalid_fahrzeugId" });
      return;
    }
    const session = req.session!;
    let doc: {
      _id: string;
      _rev?: string;
      type: "config";
      key: "qr-anchors";
      byFahrzeug: QrAnchorState["byFahrzeug"];
    };
    try {
      doc = (await db.get(QR_ANCHOR_CONFIG_ID)) as typeof doc;
      if (!doc.byFahrzeug) doc.byFahrzeug = {};
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        doc = { _id: QR_ANCHOR_CONFIG_ID, type: "config", key: "qr-anchors", byFahrzeug: {} };
      } else {
        throw err;
      }
    }
    const old = doc.byFahrzeug[fahrzeugId]?.generation ?? 1;
    doc.byFahrzeug[fahrzeugId] = {
      generation: old + 1,
      geaendertAm: new Date().toISOString(),
      geaendertVon: session.username,
    };
    const result = await db.insert(doc);
    await writeAuditEvent({
      type: "config-changed",
      actorUsername: session.username,
      actorRolle: session.rolle,
      fahrzeugId,
      details: { what: "qr-anchor-rotate", newGeneration: old + 1 },
      ipAddress: req.ip,
    });
    const newToken = await signQrAnchor(fahrzeugId, old + 1);
    logger.info(
      { fahrzeugId, generation: old + 1, by: session.username, rev: result.rev },
      "QR-Anker rotiert",
    );
    res.json({ ok: true, token: newToken, fahrzeugId, generation: old + 1 });
  }) as RequestHandler,
);

// — GET /api/auth/qr/:token — Public-Endpoint
// Wird von der PWA gerufen wenn jemand den QR scannt und /qr/<token> öffnet.
// Liefert einen normalen Tablet-Session-Token zurück. Rate-Limited als
// Defence-in-Depth — JWT-Signatur ist primärer Schutz.
authRouter.get("/api/auth/qr/:token", loginRateLimit, (async (req, res) => {
  const token = String(req.params.token ?? "");
  if (!token || token.length > 800) {
    res.status(400).json({ error: "invalid_token_format" });
    return;
  }
  const payload = await verifyQrAnchor(token);
  if (!payload) {
    recordFailedLogin(req);
    await writeAuditEvent({
      type: "login-failed",
      actorUsername: "qr:unknown",
      details: { reason: "invalid_qr_signature" },
      ipAddress: req.ip,
    });
    res.status(401).json({ error: "invalid_qr_token" });
    return;
  }
  const currentGen = await getCurrentGeneration(payload.fahrzeugId);
  if (payload.generation < currentGen) {
    recordFailedLogin(req);
    await writeAuditEvent({
      type: "login-failed",
      actorUsername: `qr:${payload.fahrzeugId}`,
      details: {
        reason: "qr_generation_revoked",
        presented: payload.generation,
        current: currentGen,
      },
      fahrzeugId: payload.fahrzeugId,
      ipAddress: req.ip,
    });
    res.status(401).json({
      error: "qr_revoked",
      message:
        "Dieser QR-Code wurde vom Funktionär ungültig gemacht. Bitte neuen QR-Sticker holen.",
    });
    return;
  }
  recordSuccessfulLogin(req);
  const deviceId = randomUUID();
  const rolle = payload.fahrzeugId === "zentrale" ? "einsatzleiter" : "mannschaft";
  const { token: sessionToken, expiresAt } = await signSession({
    sub: `tablet:${payload.fahrzeugId}:${deviceId}`,
    username: `tablet:${payload.fahrzeugId}`,
    rolle,
    fahrzeugId: payload.fahrzeugId,
  });
  await writeAuditEvent({
    type: "login-success",
    actorUsername: `qr:${payload.fahrzeugId}`,
    actorRolle: rolle,
    fahrzeugId: payload.fahrzeugId,
    userAgent: String(req.headers["user-agent"] ?? "").slice(0, 200),
    details: { via: "qr-anchor", generation: payload.generation, deviceId },
    ipAddress: req.ip,
  });
  logger.info(
    {
      fahrzeugId: payload.fahrzeugId,
      generation: payload.generation,
      rolle,
      deviceId,
      ua: String(req.headers["user-agent"] ?? "").slice(0, 60),
    },
    "QR-Anker-Login erfolgreich (Multi-Device)",
  );
  const response: AuthResponse = {
    ok: true,
    rolle,
    token: sessionToken,
    expiresAt,
    fahrzeugId: payload.fahrzeugId,
  };
  res.json(response);
}) as RequestHandler);
