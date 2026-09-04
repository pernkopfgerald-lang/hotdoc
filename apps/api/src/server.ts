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
// Loeschwasser-Layer (2026-07): wasserkarte.info-KML-Import, siehe
// services/wasserkarte-import.ts fuer den Hintergrund (keine Live-API).
import { wasserquellenRouter } from "./routes/wasserquellen.js";
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
  app.use(wasserquellenRouter);
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
  // Seit C-03 (Audit 2026-07) laufen alle async-Route-Handler durch ah()
  // (lib/async-handler.ts), das Rejections an next(err) weiterreicht — damit
  // landen auch DB-Fehler aus async-Handlern hier. Der
  // process.on("unhandledRejection")-Handler oben bleibt als letztes Netz.
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
      if (res.headersSent) return;
      // I-09: CouchDB nicht erreichbar / Timeout → 503 statt 500. Der Client
      // (apiCall im Frontend) kann 503 als "später nochmal" behandeln, statt
      // einen Server-Bug zu vermuten.
      if (isDbUnavailableError(err)) {
        res.status(503).json({ error: "db_unavailable" });
        return;
      }
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
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "@hotdoc/api gestartet");
  });

  // O-08/O-09 + I-07: Graceful Shutdown. fly.io schickt SIGTERM beim Redeploy
  // und beim Scale-Down. Reihenfolge:
  //  1. HTTP-Listener schließen — keine neuen Verbindungen mehr, laufende
  //     Requests dürfen fertig antworten (I-07: vorher wurden In-Flight-
  //     Requests beim harten Exit einfach abgeschnitten → Tablet sah einen
  //     Netzwerkfehler mitten im Speichern).
  //  2. Idle Keep-Alive-Verbindungen kappen — sonst wartet server.close()
  //     bis zum Keep-Alive-Timeout auf Sockets, auf denen nichts läuft.
  //  3. Worker + Subsysteme stoppen (Puppeteer, Poller, Eviction-Timer).
  //  4. Sobald die letzte Verbindung zu ist → exit 0. Sicherheits-Mauer:
  //     nach 9 s hart raus (fly gibt ~10 s bis SIGKILL).
  let shuttingDown = false;
  function gracefulShutdown(signal: string): void {
    if (shuttingDown) return; // Doppel-Signal ignorieren
    shuttingDown = true;
    logger.info({ signal }, "Graceful Shutdown gestartet");
    // Puppeteer-Browser schliessen — sonst bleibt der Headless-Chromium
    // als Zombie haengen. Promise merken, damit der Exit darauf wartet.
    const pdfShutdown = shutdownPdfGenerator().catch((err) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "shutdownPdfGenerator fehlgeschlagen");
    });
    // I-07: Listener zu, In-Flight-Requests fertig bedienen lassen.
    server.close(() => {
      void pdfShutdown.finally(() => {
        logger.info("Graceful Shutdown abgeschlossen (alle Verbindungen beendet), exit");
        process.exit(0);
      });
    });
    // Idle Keep-Alive-Sockets sofort trennen (Node >= 18.2; optional-call
    // als Schutz falls die Runtime das noch nicht kennt).
    server.closeIdleConnections?.();
    // BlaulichtSMS-Poller stoppen — sonst feuert das setInterval noch
    // einmal mit halb-runtergefahrener DB-Connection.
    stopBlaulichtSmsPoller();
    // Positions-State Eviction-Interval stoppen.
    stopEviction();
    // Letzte Sicherheits-Mauer: nach 9 s hart raus. Im Normalfall ist
    // server.close() deutlich früher durch (< 1 s ohne lange Requests).
    setTimeout(() => {
      logger.warn("Graceful Shutdown: Timeout nach 9 s — harter Exit");
      process.exit(0);
    }, 9000).unref?.();
  }
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

/**
 * I-09: Erkennt Verbindungs-/Timeout-Fehler Richtung CouchDB (nano/axios).
 * nano wickelt Transportfehler in `new Error("error happened in your
 * connection. Reason: <axios-message>")` ohne den Node-`code` zu
 * übernehmen — deshalb prüfen wir sowohl `code` als auch die Message.
 * Axios-Timeouts heißen "timeout of 2000ms exceeded", Node-Transportfehler
 * tragen ECONNREFUSED/ECONNRESET/ETIMEDOUT in der Message.
 */
function isDbUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const message = typeof e.message === "string" ? e.message : "";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") {
    return true;
  }
  return (
    /timeout/i.test(message) ||
    message.includes("ECONNRESET") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ESOCKETTIMEDOUT")
  );
}

main().catch((err) => {
  logger.fatal({ err }, "Fataler Startfehler");
  process.exit(1);
});
