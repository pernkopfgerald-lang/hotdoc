/**
 * Device-Registry fuer HotDoc-APK-Tablets.
 *
 * Wenn ein Tablet die HotDoc-Android-App startet, registriert es sich
 * hier mit seinem FCM-Push-Token plus Geraete-Info (Modell, OS-Version,
 * App-Version). Der BlaulichtSMS-Poller nutzt die Liste um beim Alarm
 * jedem zugewiesenen Fahrzeug eine FCM-Notification zu schicken — auch
 * wenn die App geschlossen ist (data-message mit high priority).
 *
 * Endpunkte:
 *   POST /api/devices/register   — Tablet registriert / aktualisiert sich
 *   GET  /api/devices            — Backoffice-Liste (Funktionaer)
 *   DELETE /api/devices/:id      — Eintrag entfernen (Funktionaer)
 *   GET  /api/devices/app-version — Aktuelle Server-empfohlene App-Version
 *
 * Doc-Pattern in CouchDB:
 *   device:fcm-<fahrzeugId>-<deviceUuid>  → DeviceDoc
 */

import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const devicesRouter: Router = Router();

interface DeviceDoc {
  _id: string;
  _rev?: string;
  type: "device";
  fahrzeugId: string;
  /** App-generierte UUID (stabil pro Installation, ueberlebt App-Updates). */
  deviceUuid: string;
  /** FCM-Token — kann sich aendern wenn das Tablet eine neue FCM-Session bekommt. */
  fcmToken: string;
  platform: "android" | "ios";
  manufacturer: string;
  model: string;
  osVersion: string;
  /** Installierte HotDoc-App-Version (semver). */
  appVersion: string;
  /** Wann zuletzt registriert/aktualisiert. */
  letztesUpdateAm: string;
  /** Wann erstellt — Audit-Hinweis. */
  erstelltAm: string;
}

const RegisterBodySchema = z.object({
  deviceUuid: z.string().min(8),
  fcmToken: z.string().min(20),
  platform: z.enum(["android", "ios"]),
  manufacturer: z.string().min(1),
  model: z.string().min(1),
  osVersion: z.string().min(1),
  appVersion: z.string().min(1),
});

// ─── POST /api/devices/register ──────────────────────────────────────
// Tablet ruft das beim App-Start auf und nach jedem FCM-Token-Refresh.
// Doc-ID wird aus fahrzeugId + deviceUuid zusammengesetzt — derselbe
// Tablet/Fahrzeug-Combo aktualisiert IMMER denselben Eintrag.
devicesRouter.post("/api/devices/register", requireAuth("mannschaft"), (async (req, res) => {
  const parsed = RegisterBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const session = req.session!;
  const fahrzeugId = session.fahrzeugId;
  if (!fahrzeugId) {
    res.status(400).json({ error: "no_fahrzeug_in_session" });
    return;
  }
  const docId = `device:fcm-${fahrzeugId}-${parsed.data.deviceUuid}`;
  const now = new Date().toISOString();
  let existing: DeviceDoc | null = null;
  try {
    existing = (await db.get(docId)) as DeviceDoc;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
  const doc: DeviceDoc = {
    _id: docId,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: "device",
    fahrzeugId,
    deviceUuid: parsed.data.deviceUuid,
    fcmToken: parsed.data.fcmToken,
    platform: parsed.data.platform,
    manufacturer: parsed.data.manufacturer,
    model: parsed.data.model,
    osVersion: parsed.data.osVersion,
    appVersion: parsed.data.appVersion,
    letztesUpdateAm: now,
    erstelltAm: existing?.erstelltAm ?? now,
  };
  const result = await db.insert(doc);
  logger.info(
    { docId, fahrzeugId, model: parsed.data.model, appVersion: parsed.data.appVersion },
    "Device registriert",
  );
  res.json({ ok: true, id: docId, rev: result.rev });
}) as RequestHandler);

// ─── GET /api/devices ────────────────────────────────────────────────
// Liste fuer das Backoffice. PII (FCM-Token, Geraete-IDs) wird zurueck-
// gegeben — Funktionaer-Rolle ist Pflicht.
devicesRouter.get("/api/devices", requireAuth("funktionaer"), (async (_req, res) => {
  const list = await db.list({
    startkey: "device:",
    endkey: "device:￰",
    include_docs: true,
  });
  const docs = list.rows
    .map((r) => r.doc)
    .filter((d): d is NonNullable<typeof d> => !!d && (d as { type?: string }).type === "device");
  // FCM-Token kuerzen damit er im Backoffice nicht voll im Log landet.
  const safeDocs = docs.map((d) => {
    const doc = d as DeviceDoc;
    return {
      ...doc,
      fcmTokenPreview: doc.fcmToken
        ? `${doc.fcmToken.substring(0, 12)}…${doc.fcmToken.substring(doc.fcmToken.length - 6)}`
        : "",
      fcmToken: undefined,
    };
  });
  res.json({ ok: true, items: safeDocs });
}) as RequestHandler);

// ─── DELETE /api/devices/:id ─────────────────────────────────────────
// Wenn ein Tablet defekt/gestohlen ist, soll der Funktionaer es aus der
// Push-Liste entfernen koennen. Geraet bekommt dann keine Alarm-Pushes
// mehr (wenn es jemals wieder online geht).
devicesRouter.delete("/api/devices/:id", requireAuth("funktionaer"), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  try {
    const doc = (await db.get(id)) as DeviceDoc;
    await db.destroy(id, doc._rev!);
    logger.warn({ id, by: req.session?.username }, "Device entfernt");
    res.json({ ok: true, id });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "device_not_found" });
      return;
    }
    throw err;
  }
}) as RequestHandler);

// ─── GET /api/devices/app-version ────────────────────────────────────
// Tablets pollen das beim Start + alle paar Stunden. Wenn die Server-
// empfohlene Version groesser ist als die installierte, zeigt die App
// ein dezentes "Update verfuegbar"-Hinweis (Phase 2 — In-App-Update).
// Public-ish: braucht nur eine valide Session, kein Funktionaer-Rolle.
devicesRouter.get("/api/devices/app-version", requireAuth(), (async (_req, res) => {
  try {
    const doc = (await db.get("config:app-version")) as {
      currentVersion: string;
      apkUrl: string;
      releaseNotes?: string;
      minSupported?: string;
    };
    res.json({
      ok: true,
      currentVersion: doc.currentVersion,
      apkUrl: doc.apkUrl,
      releaseNotes: doc.releaseNotes ?? "",
      minSupported: doc.minSupported ?? "0.0.0",
    });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      // Noch keine Version gepflegt — kein Update verfuegbar.
      res.json({
        ok: true,
        currentVersion: "0.0.0",
        apkUrl: "",
        releaseNotes: "",
        minSupported: "0.0.0",
      });
      return;
    }
    throw err;
  }
}) as RequestHandler);
