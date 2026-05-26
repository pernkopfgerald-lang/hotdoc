import { Router, type RequestHandler } from "express";
import { runSyBosSync } from "../workers/sybos-sync.js";
import { collectHealth } from "../services/health.js";
import { loadRecentAuditEvents } from "../services/audit.js";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const adminRouter: Router = Router();

/**
 * Echte Status-Probe aller Schnittstellen — wird vom DemoBanner sowie
 * dem Backoffice-Tab "Schnittstellen" gepollt.
 *
 * Bleibt absichtlich öffentlich: zeigt nur "Integration X ist online/
 * offline", keine Credentials/IPs. Frontend-Banner braucht das vor
 * dem Login (Demo-Banner-Polling).
 */
adminRouter.get("/api/admin/health", async (_req, res) => {
  const health = await collectHealth();
  res.json(health);
});

/**
 * Manueller Trigger für syBOS-Sync — z. B. nach syBOS-Stammdaten-Änderung
 * ohne auf den nächsten Cron-Tick warten zu wollen.
 * Data-Modifying → requireAuth("funktionaer").
 */
adminRouter.post("/api/admin/sybos/sync", requireAuth("funktionaer"), (async (req, res) => {
  logger.info({ ua: req.headers["user-agent"], by: req.session?.username }, "Manueller syBOS-Sync angefordert");
  const result = await runSyBosSync();
  res.status(result.ok ? 200 : 500).json(result);
}) as RequestHandler);

/**
 * Read-only Personen-Liste — Tablets brauchen das zum Auflösen von
 * `fahrzeugKdtPersonId` zu Klar-Namen in der Florianstation-Statusliste.
 *
 * Liefert nur die Felder die das UI braucht: syBosId, vorname, nachname,
 * rang, aktiv. KEINE Telefonnummern, KEINE Geburtsdaten — wird per
 * `requireAuth()` zusätzlich geschützt damit nur eingeloggte Tablets/
 * Backoffice-User die Liste sehen.
 */
adminRouter.get("/api/admin/personen", requireAuth(), (async (_req, res) => {
  const list = await db.list({
    startkey: "person:",
    endkey: "person:￰",
    include_docs: true,
    descending: false,
  });
  const items = list.rows
    .map((r) => r.doc as Record<string, unknown> | undefined)
    .filter((d): d is Record<string, unknown> => !!d && d.type === "person")
    .map((d) => ({
      syBosId: d.syBosId as number,
      vorname: d.vorname as string | undefined,
      nachname: d.nachname as string | undefined,
      rang: d.rang as string | undefined,
      aktiv: d.aktiv as boolean | undefined,
    }))
    .filter((p) => p.aktiv !== false);
  res.json({ ok: true, count: items.length, items });
}) as RequestHandler);

/**
 * Audit-Events — die letzten N Events (Default 50). Für Verwaltung-Tab
 * „Aktivität". Nur funktionaer+ darf das sehen (Datenschutz: Login-Fails
 * mit Username/IP sind sensibel).
 */
adminRouter.get("/api/admin/audit", requireAuth("funktionaer"), (async (req, res) => {
  const rawLimit = req.query.limit;
  const limit = Math.min(200, Math.max(1, Number(rawLimit) || 50));
  const items = await loadRecentAuditEvents(limit);
  res.json({ ok: true, count: items.length, items });
}) as RequestHandler);
