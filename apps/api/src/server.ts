import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./config.js";
import { ensureDatabase } from "./couch/client.js";
import { logger } from "./lib/logger.js";
import { healthRouter } from "./routes/health.js";

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

  // — DB-Bootstrap —
  try {
    await ensureDatabase();
  } catch (err) {
    logger.error({ err }, "CouchDB-Bootstrap fehlgeschlagen — Server startet trotzdem, /healthz bleibt grün");
  }

  // — Start —
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "@hotdoc/api gestartet");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fataler Startfehler");
  process.exit(1);
});
