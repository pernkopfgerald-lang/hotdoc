import { Router } from "express";
import { runSyBosSync } from "../workers/sybos-sync.js";
import { collectHealth } from "../services/health.js";
import { logger } from "../lib/logger.js";

export const adminRouter: Router = Router();

/**
 * Echte Status-Probe aller Schnittstellen — wird vom Backoffice-Tab
 * "Schnittstellen" pro Click auf "Status prüfen" aufgerufen.
 * Liefert keine Auth-Anforderung; sollte vor Live-Schaltung mit
 * Admin-Auth-Middleware versehen werden (FR-15).
 */
adminRouter.get("/api/admin/health", async (_req, res) => {
  const health = await collectHealth();
  res.json(health);
});

/**
 * Manueller Trigger für syBOS-Sync — z. B. nach syBOS-Stammdaten-Änderung
 * ohne auf den nächsten Cron-Tick warten zu wollen.
 *
 * In Phase 5 wird das durch Auth-Middleware geschützt (nur funktionaer/admin).
 */
adminRouter.post("/api/admin/sybos/sync", async (req, res) => {
  logger.info({ ua: req.headers["user-agent"] }, "Manueller syBOS-Sync angefordert");
  const result = await runSyBosSync();
  res.status(result.ok ? 200 : 500).json(result);
});
