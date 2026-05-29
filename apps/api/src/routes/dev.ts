/**
 * Diagnose- + Setup-Endpoints. Urspruenglich als Dev-Tooling gedacht, in
 * Produktion aber fuer Inbetriebnahme/Smoke-Test benoetigt.
 *
 * Alle Routen verlangen einen funktionaer/admin-Login — das verhindert,
 * dass jemand Anonymes Egress-IPs oder Konfig-Details abfragt. Diese
 * Auth-Haertung ergaenzt FR-15 (Tablet-Auth) fuer den Backoffice-Bereich.
 *
 * (Frueher gab es hier einen /api/dev/blaulichtsms/trigger fuer Mock-
 * Alarme. Wurde entfernt — Test-Einsätze laufen jetzt sauber ueber den
 * normalen "Neuer Einsatz → Übung"-Flow im Backoffice/PWA.)
 */

import { Router, type RequestHandler } from "express";
import { env } from "../config.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { probeBlaulichtSms } from "../services/blaulichtsms/client.js";
import { pollOnce } from "../workers/blaulichtsms-poller.js";

export const devRouter: Router = Router();

// Alle /api/dev/*-Routen verlangen mindestens funktionaer. Schreibende
// Routen (poll) sogar admin-Login — siehe pro Route.

/** Manueller Poll-Trigger ohne Cron-Intervall abzuwarten. */
devRouter.post("/api/dev/blaulichtsms/poll", requireAuth("admin"), (async (_req, res) => {
  const result = await pollOnce();
  res.json({ ok: true, ...result });
}) as RequestHandler);

/** Diagnostic: testet die CouchDB-Konnektivität direkt. */
devRouter.get("/api/dev/db-test", requireAuth("funktionaer"), (async (_req, res) => {
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
devRouter.get("/api/dev/egress-ip", requireAuth("funktionaer"), (async (_req, res) => {
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
devRouter.get("/api/dev/blaulichtsms-probe", requireAuth("funktionaer"), (async (_req, res) => {
  const probe = await probeBlaulichtSms();
  res.status(probe.ok ? 200 : 502).json(probe);
}) as RequestHandler);

/**
 * Generischer syBOS-Probe. Query-Params:
 *  - endpoint=Personal.php (Default) | Material.php | Abteilung.php | PersUeberpruefung.php
 *  - Art=MITGLIEDER  (für Personal)
 *  - WATcode=…       (für Material — Filter optional)
 *  - Status=o|e|w    (für PersUeberpruefung)
 *  - Alle weiteren Query-Params werden 1:1 an syBOS weitergegeben.
 *
 * Liefert die ersten 4000 Zeichen der Roh-Antwort + Status + content-type.
 * Praktisch um zu sehen wie syBOS auf bestimmte Aufrufe reagiert.
 */
devRouter.get("/api/dev/sybos-probe", requireAuth("funktionaer"), (async (req, res) => {
  if (!env.SYBOS_API_URL || !env.SYBOS_TOKEN) {
    res.status(412).json({ error: "SYBOS_API_URL oder SYBOS_TOKEN nicht gesetzt" });
    return;
  }
  const endpoint = String(req.query.endpoint ?? "Personal.php");
  // Whitelist um Path-Traversal zu verhindern
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,50}\.php$/.test(endpoint)) {
    res.status(400).json({ error: "invalid_endpoint", hint: "Format: <Name>.php" });
    return;
  }
  const url = new URL(env.SYBOS_API_URL.replace(/\/$/, "") + "/API/" + endpoint);
  url.searchParams.set("token", env.SYBOS_TOKEN);
  url.searchParams.set("json", "1");
  // Default-Params je nach Endpoint
  if (endpoint === "Personal.php" && !req.query.Art) {
    url.searchParams.set("Art", "MITGLIEDER");
  }
  // Alle Query-Params außer token/endpoint weiterreichen
  for (const [k, v] of Object.entries(req.query)) {
    if (k === "endpoint" || k === "token") continue;
    if (typeof v === "string") url.searchParams.set(k, v);
  }
  try {
    const r = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json, text/xml" },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await r.text();
    // Parsing-Versuch + Count
    let parsedNumber: number | string | undefined;
    let itemCount: number | undefined;
    try {
      const j = JSON.parse(body) as { number?: number | string; item?: unknown };
      parsedNumber = j.number;
      const item = j.item;
      itemCount = Array.isArray(item) ? item.length : item ? 1 : 0;
    } catch {
      /* HTML/XML-Antwort, kein JSON */
    }
    res.json({
      ok: r.ok,
      status: r.status,
      endpoint,
      url: url.toString().replace(env.SYBOS_TOKEN, "[REDACTED]"),
      contentType: r.headers.get("content-type"),
      parsedNumber,
      itemCount,
      body: body.slice(0, 4000),
      bodyTruncated: body.length > 4000,
      bodyTotalBytes: body.length,
    });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}) as RequestHandler);
