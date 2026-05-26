/**
 * Entwickler-Endpoints für lokales Testen ohne echte externe Services.
 * Werden nur in NODE_ENV !== "production" exponiert.
 */

import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";
import { probeBlaulichtSms, pushMockAlarm } from "../services/blaulichtsms/client.js";
import { pollOnce } from "../workers/blaulichtsms-poller.js";

export const devRouter: Router = Router();

// Hinweis: Dev-Endpoints sind aktuell auch in production aktiv, damit das
// erste Live-Setup ohne echte BlaulichtSMS-Credentials getestet werden kann.
// Für den Produktivbetrieb hinter Auth-Gate + Feature-Flag setzen.

const TriggerSchema = z.object({
  einsatzort: z.string().default("Eberstalzeller Straße 5, 4653 Eberstalzell"),
  alarmText: z.string().default("Brand KFZ"),
  koordinaten: z
    .object({ lat: z.number(), lng: z.number() })
    .default({ lat: 48.11, lng: 13.961 }),
  authorName: z.enum(["BWST", "LWZ"]).default("BWST"),
});

/** Triggert einen Mock-Alarm — der nächste Poll legt einen Einsatz an. */
devRouter.post("/api/dev/blaulichtsms/trigger", (async (req, res) => {
  const parsed = TriggerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const alarmId = `MOCK-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4)}`;
  pushMockAlarm({
    customerId: "mock",
    alarmId,
    alarmDate: new Date().toISOString(),
    authorName: parsed.data.authorName,
    alarmText: parsed.data.alarmText,
    geolocation: {
      address: parsed.data.einsatzort,
      coordinates: parsed.data.koordinaten,
    },
  });
  const result = await pollOnce();
  logger.info({ alarmId, result }, "Mock-Alarm konsumiert");
  res.json({ ok: true, alarmId, einsatzId: `einsatz:${alarmId}`, ...result });
}) as RequestHandler);

/** Manueller Poll-Trigger ohne Cron-Intervall abzuwarten. */
devRouter.post("/api/dev/blaulichtsms/poll", (async (_req, res) => {
  const result = await pollOnce();
  res.json({ ok: true, ...result });
}) as RequestHandler);

/** Diagnostic: testet die CouchDB-Konnektivität direkt. */
devRouter.get("/api/dev/db-test", (async (_req, res) => {
  const result: Record<string, unknown> = {
    couchUrl: env.COUCH_URL,
    couchDb: env.COUCH_DB,
    couchUser: env.COUCH_USER,
  };
  try {
    const basic = Buffer.from(`${env.COUCH_USER}:${env.COUCH_PASS}`).toString("base64");
    const ping = await fetch(env.COUCH_URL + "/", {
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(5000),
    });
    result.pingStatus = ping.status;
    result.pingText = (await ping.text()).slice(0, 300);
    const dbs = await fetch(env.COUCH_URL + "/_all_dbs", {
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(5000),
    });
    result.allDbs = await dbs.text();
  } catch (err) {
    result.pingError = err instanceof Error ? err.message : String(err);
  }
  res.json(result);
}) as RequestHandler);

/**
 * Liefert die Egress-IP der Fly-Machine.
 *
 * Wird von 3 verschiedenen "what is my IP"-Services gefragt, damit
 * mindestens eine Antwort kommt auch wenn ein Anbieter blockt.
 * Wir brauchen das, damit der syBOS-Admin die IP in die
 * Server-IPs-Whitelist eintragen kann (sonst gibt syBOS 401 zurück).
 */
devRouter.get("/api/dev/egress-ip", (async (_req, res) => {
  const probes = [
    "https://api.ipify.org?format=json",
    "https://ipv4.icanhazip.com",
    "https://checkip.amazonaws.com",
  ];
  const results: Record<string, unknown> = {};
  for (const url of probes) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const text = (await r.text()).trim();
      results[url] = text.startsWith("{") ? JSON.parse(text) : text;
    } catch (err) {
      results[url] = `ERR: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  res.json({ ok: true, probes: results });
}) as RequestHandler);

/**
 * Roh-Probe gegen syBOS. Liefert HTTP-Status + Body, damit der echte
 * Fehlertext (z. B. `<error>falsche Server-IP (152.236.9.7)</error>`)
 * sichtbar wird — die Sync-Route normalisiert das auf "HTTP 401" und
 * verschluckt damit die Diagnose-Info.
 */
/**
 * Roh-Probe gegen BlaulichtSMS-Dashboard-API. Login + erster
 * Dashboard-Call, liefert sessionId-Prefix und Alarm-Anzahl.
 * Erspart Smoke-Test-Skripte für die Inbetriebnahme.
 */
devRouter.get("/api/dev/blaulichtsms-probe", (async (_req, res) => {
  const probe = await probeBlaulichtSms();
  res.status(probe.ok ? 200 : 502).json(probe);
}) as RequestHandler);

devRouter.get("/api/dev/sybos-probe", (async (_req, res) => {
  if (!env.SYBOS_API_URL || !env.SYBOS_TOKEN) {
    res.status(412).json({ error: "SYBOS_API_URL oder SYBOS_TOKEN nicht gesetzt" });
    return;
  }
  const url = new URL(env.SYBOS_API_URL.replace(/\/$/, "") + "/API/Personal.php");
  url.searchParams.set("token", env.SYBOS_TOKEN);
  url.searchParams.set("json", "1");
  url.searchParams.set("Art", "MITGLIEDER");
  try {
    const r = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json, text/xml" },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await r.text();
    res.json({
      ok: r.ok,
      status: r.status,
      contentType: r.headers.get("content-type"),
      body: body.slice(0, 2000),
    });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}) as RequestHandler);
