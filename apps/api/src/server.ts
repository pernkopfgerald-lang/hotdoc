import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./config.js";
import { ensureDatabase } from "./couch/client.js";
import { logger } from "./lib/logger.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { configRouter } from "./routes/config.js";
import { devRouter } from "./routes/dev.js";
import { einsaetzeRouter } from "./routes/einsaetze.js";
import { healthRouter } from "./routes/health.js";
import { pdfRouter } from "./routes/pdf.js";
import { bootstrapInitialAdminIfMissing } from "./services/auth/bootstrap.js";
import { startAudioRetentionCron } from "./workers/audio-retention.js";
import { startBlaulichtSmsPoller } from "./workers/blaulichtsms-poller.js";
import { startSyBosSyncCron } from "./workers/sybos-sync.js";

async function main(): Promise<void> {
  const app = express();

  // — Middleware —
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp({ logger }));

  // — Routes —
  app.use(healthRouter);
  app.use(authRouter);
  app.use(adminRouter);
  app.use(configRouter);
  app.use(einsaetzeRouter);
  app.use(pdfRouter);
  app.use(devRouter);

  // — DB-Bootstrap —
  try {
    await ensureDatabase();
    await bootstrapInitialAdminIfMissing();
  } catch (err) {
    logger.error({ err }, "CouchDB-Bootstrap fehlgeschlagen — Server startet trotzdem, /healthz bleibt grün");
  }

  // — Worker —
  startSyBosSyncCron();
  startBlaulichtSmsPoller();
  startAudioRetentionCron();

  // — Start —
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "@hotdoc/api gestartet");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fataler Startfehler");
  process.exit(1);
});
