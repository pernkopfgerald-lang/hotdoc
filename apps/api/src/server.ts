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
import { devicesRouter } from "./routes/devices.js";
import { devRouter } from "./routes/dev.js";
import { einsaetzeRouter } from "./routes/einsaetze.js";
import { geocodeRouter } from "./routes/geocode.js";
import { geocodingRouter } from "./routes/geocoding.js";
import { healthRouter } from "./routes/health.js";
// Issue 17 (Einsatz-Test 2026-06-02): Objekt-Datenbank fuer Brand-Wiederholungs-Einsaetze.
import { objekteRouter } from "./routes/objekte.js";
// Foto-Funktion (2026-06-03): Einsatz-Fotos (Chronik).
import { fotosRouter } from "./routes/fotos.js";
import { pdfRouter } from "./routes/pdf.js";
import { positionsRouter } from "./routes/positions.js";
import { routingRouter } from "./routes/routing.js";
import { bootstrapInitialAdminIfMissing } from "./services/auth/bootstrap.js";
import { shutdownPdfGenerator } from "./services/pdf/generator.js";
import { stopEviction } from "./services/positions-state.js";
import { startAudioRetentionCron } from "./workers/audio-retention.js";
import { startAuditRetentionCron } from "./workers/audit-retention.js";
import { startAutoCloseStaleCron } from "./workers/auto-close-stale.js";
import {
  startBlaulichtSmsPoller,
  stopBlaulichtSmsPoller,
} from "./workers/blaulichtsms-poller.js";
import { startPhantomCleanupCron } from "./workers/phantom-fzgber-cleanup.js";
import { startSyBosSyncCron } from "./workers/sybos-sync.js";

async function main(): Promise<void> {
  // BLOCKER-4 (Audit 2026-06-03): Prozess-Überlebens-Garantie.
  // Mission-Critical-Prämisse: Ein einzelner unbehandelter Fehler in einem
  // async-Express-Handler darf NICHT den ganzen API-Prozess killen — sonst
  // sind alle 5 Fahrzeug-Tablets gleichzeitig offline (Node beendet sich bei
  // unhandledRejection je nach Flag mit Exit-Code). Wir loggen den Fehler und
  // lassen den Prozess WEITERLAUFEN: ein hängender Einzel-Request (vom
  // Client-seitigen apiCall-Timeout abgefangen) ist weit weniger schlimm als
  // ein toter Server. fly.io startet bei echtem Heap-Schaden via /healthz-
  // Check ohnehin neu — bis dahin bedient der Prozess alle anderen Requests.
  process.on("unhandledRejection", (reason) => {
    logger.error(
      { reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason },
      "unhandledRejection — Prozess bleibt am Leben (Mission-Critical)",
    );
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "uncaughtException — Prozess bleibt am Leben (Mission-Critical)");
  });

  const app = express();

  // — Middleware —
  // trust proxy: damit req.ip die echte Client-IP aus X-Forwarded-For nimmt
  // (Fly setzt das automatisch). Wichtig für das Login-Rate-Limit damit
  // wir nicht alle Logins durch den fly-Edge-Proxy zusammenwerfen.
  app.set("trust proxy", true);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  // Foto-Funktion (2026-06-03): Limit von 2mb auf 6mb angehoben. Ein client-
  // komprimiertes Einsatz-Foto ist als Base64-Data-URL ~0,5–1,5 MB; 6 MB gibt
  // Puffer für Mehrfach-Felder + nicht optimal komprimierte Bilder. Unkritisch,
  // da die API nur im FF-LAN/Tailscale erreichbar ist (kein offenes Internet).
  app.use(express.json({ limit: "6mb" }));

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
  // Issue 17 (Einsatz-Test 2026-06-02): Objekt-Datenbank-Routes.
  app.use(objekteRouter);
  // Foto-Funktion (2026-06-03): Einsatz-Foto-Upload/-Liste.
  app.use(fotosRouter);
  app.use(pdfRouter);
  app.use(audioRouter);
  app.use(geocodeRouter);
  app.use(geocodingRouter);
  app.use(positionsRouter);
  app.use(routingRouter);
  app.use(devicesRouter);
  app.use(devRouter);

  // BLOCKER-4 (Audit 2026-06-03): Globaler Error-Handler — MUSS nach allen
  // Routen stehen und GENAU 4 Argumente haben (Express erkennt Error-Handler
  // an der Arität). Fängt synchron geworfene Fehler + alles was via next(err)
  // kommt und sendet eine saubere 500, statt den Request hängen zu lassen.
  // (Reine async-Handler-Rejections ohne next() landen NICHT hier — die deckt
  // der process.on("unhandledRejection")-Handler oben ab; eine npm-Dependency
  // wie express-async-errors wäre dafür nötig, ist aber lt. CLAUDE.md §1 ohne
  // Freigabe tabu.)
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
      if (res.headersSent) return;
      const sc = (err as { statusCode?: number })?.statusCode;
      const code = typeof sc === "number" && sc >= 400 && sc < 600 ? sc : 500;
      res.status(code).json({ error: "internal_error" });
    },
  );

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
  // Phantom-Fahrzeugbericht-Cleanup: bereinigt leere Fahrzeugberichte 2h
  // nach Einsatz-Abschluss — Folge des Auto-Open-Verhaltens bei BlaulichtSMS-
  // Alarmen, bei denen nicht jedes Fahrzeug ausrückt.
  startPhantomCleanupCron();
  // Auto-Close: schließt stale Aufträge ab nach AUTO_CLOSE_HOURS (Default 6h).
  // Greift wenn ein Tablet ohne Abschluss weggelegt wird. Cascade-schließt
  // auch offene Fahrzeugberichte. Wert <= 0 deaktiviert das Feature.
  startAutoCloseStaleCron();

  // — Start —
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "@hotdoc/api gestartet");
  });

  // O-08/O-09: Graceful Shutdown. fly.io schickt SIGTERM beim Redeploy
  // und beim Scale-Down. Wir geben den Workern + Subsystemen 5 Sekunden
  // Zeit, sauber runterzufahren (Puppeteer-Browser schliessen, Cron-
  // Timer stoppen, BlaulichtSMS-Poller-Interval clearen). Danach hartes
  // process.exit damit fly nicht ewig wartet.
  let shuttingDown = false;
  function gracefulShutdown(signal: string): void {
    if (shuttingDown) return; // Doppel-Signal ignorieren
    shuttingDown = true;
    logger.info({ signal }, "Graceful Shutdown gestartet");
    // Puppeteer-Browser schliessen — sonst bleibt der Headless-Chromium
    // als Zombie haengen.
    void shutdownPdfGenerator().catch((err) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "shutdownPdfGenerator fehlgeschlagen");
    });
    // BlaulichtSMS-Poller stoppen — sonst feuert das setInterval noch
    // einmal mit halb-runtergefahrener DB-Connection.
    stopBlaulichtSmsPoller();
    // Positions-State Eviction-Interval stoppen.
    stopEviction();
    // Letzte Sicherheits-Mauer: nach 5s hart raus. Im Normalfall sollten
    // die obigen await/clearInterval-Calls < 1s brauchen.
    setTimeout(() => {
      logger.info("Graceful Shutdown abgeschlossen, exit");
      process.exit(0);
    }, 5000).unref?.();
  }
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "Fataler Startfehler");
  process.exit(1);
});
