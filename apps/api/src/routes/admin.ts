import { Router } from "express";
import { runSyBosSync } from "../workers/sybos-sync.js";
import { logger } from "../lib/logger.js";

export const adminRouter: Router = Router();

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
