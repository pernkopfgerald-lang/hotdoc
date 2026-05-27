import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./config.js";
import { ensureDatabase } from "./couch/client.js";
import { logger } from "./lib/logger.js";
import { adminRouter } from "./routes/admin.js";
import { audioRouter } from "./routes/audio.js";
import { authRouter } from "./routes/auth.js";
import { configRouter } from "./routes/config.js";
import { devRouter } from "./routes/dev.js";
import { einsaetzeRouter } from "./routes/einsaetze.js";
import { healthRouter } from "./routes/health.js";
import { pdfRouter } from "./routes/pdf.js";
import { bootstrapInitialAdminIfMissing } from "./services/auth/bootstrap.js";
import { startAudioRetentionCron } from "./workers/audio-retention.js";
import { startAuditRetentionCron } from "./workers/audit-retention.js";
import { startBlaulichtSmsPoller } from "./workers/blaulichtsms-poller.js";
import { startSyBosSyncCron } from "./workers/sybos-sync.js";

async function main(): Promise<void> {
  const app = express();

  // — Middleware —
  // trust proxy: damit req.ip die echte Client-IP aus X-Forwarded-For nimmt
  // (Fly setzt das automatisch). Wichtig für das Login-Rate-Limit damit
  // wir nicht alle Logins durch den fly-Edge-Proxy zusammenwerfen.
  app.set("trust proxy", true);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));

  // pino-http mit PII-Filter — Authorization-Header, PINs, Passwörter werden
  // im Logger redaktiert. Wichtig für DSGVO-Konformität: Logs landen in fly's
  // Logging-Backend und werden ggf. an externe Tools weitergegeben. Niemals
  // Bearer-Tokens oder Passwörter dort speichern.
  app.use(
    pinoHttp({
      logger,
      // pino's eingebaute Redact-Engine
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-forwarded-for"]', // kann PII enthalten — IP wird über req.ip korrekt aufgelöst
          'req.body.password',
          'req.body.pin',
          'req.body.passwordHash',
          'req.body.token',
          'req.body.sessionId',
          'res.headers["set-cookie"]',
        ],
        remove: false,  // wir wollen sehen DASS das Feld da war, nur den Wert nicht
        censor: '[REDACTED]',
      },
      // Custom serializers — pino-http defaultet eigentlich auf was sinnvolles
      // aber wir wollen Token nirgendwo durchrutschen lassen
      serializers: {
        req(req: { headers?: Record<string, unknown>; method?: string; url?: string }) {
          const safeHeaders = { ...(req.headers ?? {}) };
          if (typeof safeHeaders.authorization === 'string') {
            safeHeaders.authorization = '[REDACTED]';
          }
          if (typeof safeHeaders.cookie === 'string') {
            safeHeaders.cookie = '[REDACTED]';
          }
          return {
            method: req.method,
            url: req.url,
            headers: safeHeaders,
          };
        },
      },
    }),
  );

  // — Routes —
  app.use(healthRouter);
  app.use(authRouter);
  app.use(adminRouter);
  app.use(configRouter);
  app.use(einsaetzeRouter);
  app.use(pdfRouter);
  app.use(audioRouter);
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
  // Audit-Retention: löscht audit:*-Events älter als AUDIT_RETENTION_DAYS.
  // Schließt die in der Spec §24.1 als Gap markierte DSGVO-Lücke.
  startAuditRetentionCron();

  // — Start —
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "@hotdoc/api gestartet");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Fataler Startfehler");
  process.exit(1);
});
