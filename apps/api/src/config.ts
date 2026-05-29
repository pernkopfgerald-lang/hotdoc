import { z } from "zod";

/**
 * Strenge Validierung aller env-Variablen beim Start.
 * Failt sofort wenn etwas fehlt — kein silent Fallback.
 *
 * Production-Sicherheits-Anker (durch superRefine erzwungen):
 *  - JWT_SECRET muss ein echter, ≥32-Zeichen langer Wert sein
 *    (nicht der Dev-Default-String, der öffentlich im Repo steht).

 *  - BlaulichtSMS-Credentials muessen gesetzt sein, sonst liefert der
 *    Poller leere Listen → keine Alarme. (Mock-Modus wurde entfernt.)
 *  - Bootstrap-Admin-Passwort muss vom Default verschieden sein.
 *  - Override-Schalter HOTDOC_ALLOW_INSECURE_DEFAULTS=1 für seltene
 *    Notfälle (Bare-Metal-Restore mit nur teil-bekannter Secret-Liste).
 */

/** Default-Marker — wenn das Env-File diesen Wert hat, ist es definitiv unkonfiguriert. */
const JWT_SECRET_DEV_DEFAULT =
  "dev-secret-bitte-in-production-ueberschreiben-mit-fly-secrets";
const BOOTSTRAP_ADMIN_PASSWORD_DEV_DEFAULT = "admin12345678";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),

    // CouchDB
    COUCH_URL: z.string().url().default("http://localhost:5984"),
    COUCH_USER: z.string().default("admin"),
    COUCH_PASS: z.string().default("admin"),
    COUCH_DB: z.string().default("hotdoc"),

    // BlaulichtSMS — Phase 3
    BLAULICHTSMS_CUSTOMER_ID: z.string().optional(),
    BLAULICHTSMS_USER: z.string().optional(),
    BLAULICHTSMS_PW: z.string().optional(),
    BLAULICHTSMS_BASE_URL: z.string().url().default("https://api.blaulichtsms.net/blaulicht"),
    BLAULICHTSMS_POLL_INTERVAL_SEC: z.coerce.number().int().positive().default(15),

    // syBOS — Phase 1+3
    SYBOS_API_URL: z.string().url().optional(),
    SYBOS_TOKEN: z.string().optional(),
    SYBOS_SYNC_CRON: z.string().default("0 4 * * *"),

    // wasserkarte.info — Phase 4
    WASSERKARTE_ACCESS_KEY: z.string().optional(),
    WASSERKARTE_BASE_URL: z.string().url().default("https://api.wasserkarte.info"),

    // GraphHopper Routing (Free Plan, 500 Credits/Tag) — fuer Fahrzeug-Tablets
    GRAPHHOPPER_API_KEY: z.string().optional(),
    GRAPHHOPPER_BASE_URL: z
      .string()
      .url()
      .default("https://graphhopper.com/api/1"),

    // WebPush (VAPID) — Phase 3
    VAPID_PUBLIC: z.string().optional(),
    VAPID_PRIVATE: z.string().optional(),
    VAPID_SUBJECT: z.string().email().default("admin@ff-eberstalzell.at"),

    // OpenAI Whisper Fallback — Phase 5
    OPENAI_API_KEY: z.string().optional(),

    // Retention (Phase 8 + Audit) — beide DSGVO-relevant.
    AUDIO_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
    /** Audit-Events-Lebensdauer in Tagen. Default 365 (1 Jahr — Spec §17.3). */
    AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

    // Auth — Phase 3
    JWT_SECRET: z.string().min(32).default(JWT_SECRET_DEV_DEFAULT),
    /** Cookie-Name für Backoffice-Session. */
    AUTH_COOKIE_NAME: z.string().default("hotdoc.session"),
    /** Session-Lebensdauer in Sekunden (default 8h). */
    SESSION_TTL_SEC: z.coerce.number().int().positive().default(8 * 60 * 60),
    /** Initial-Admin-Anmeldung beim Server-Start auto-anlegen, falls keine Benutzer existieren. */
    BOOTSTRAP_ADMIN_USERNAME: z.string().default("admin"),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().default(BOOTSTRAP_ADMIN_PASSWORD_DEV_DEFAULT),

    /**
     * Notfall-Override für Bare-Metal-Restores oder Test-Setups, die mit
     * nicht-aufgesetzten Secrets booten sollen. NICHT in Produktion setzen.
     */
    HOTDOC_ALLOW_INSECURE_DEFAULTS: z.string().optional(),

    /**
     * Tablet-Setup ohne PIN-Prüfung — sinnvoll wenn die Tablets im
     * geschlossenen Tailscale-Netz hängen und die PIN nur Komfort-Schikane
     * wäre. "1" = PIN-Check übersprungen, jedes Tablet darf sich für
     * beliebiges Fahrzeug registrieren.
     * Default leer = klassische PIN-Prüfung wie bisher.
     */
    HOTDOC_TABLET_NO_PIN: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;
    if (data.HOTDOC_ALLOW_INSECURE_DEFAULTS === "1") return;

    /**
     * Zwei-Stufen-Modell:
     *  - Default (HOTDOC_STRICT_PRODUCTION ≠ "1"): WARNUNGEN ins Log, kein
     *    Boot-Fail. Erlaubt schrittweise Migration der Secrets von `[env]`
     *    in `fly secrets` ohne dass die App zwischendurch nicht mehr bootet.
     *  - Strict (HOTDOC_STRICT_PRODUCTION = "1"): Boot-Fail. Soll gesetzt
     *    werden sobald alle Secrets sauber migriert sind und das Repo keine
     *    Defaults mehr enthält.
     *
     * Audit-Trail in Log: jede Warnung erscheint sichtbar in fly-Logs mit
     * `level=warn` und konkretem Hinweis zur Migration.
     */
    const strict = process.env.HOTDOC_STRICT_PRODUCTION === "1";
    const issues: Array<{ path: string; message: string }> = [];

    if (data.JWT_SECRET === JWT_SECRET_DEV_DEFAULT) {
      issues.push({
        path: "JWT_SECRET",
        message:
          "JWT_SECRET ist auf dem Dev-Default — in Production muss ein echtes Secret via fly secrets gesetzt sein (min 32 Zeichen).",
      });
    }
    if (data.BOOTSTRAP_ADMIN_PASSWORD === BOOTSTRAP_ADMIN_PASSWORD_DEV_DEFAULT) {
      issues.push({
        path: "BOOTSTRAP_ADMIN_PASSWORD",
        message:
          "BOOTSTRAP_ADMIN_PASSWORD ist auf dem Dev-Default 'admin12345678' — publicly known. In Production muss ein echtes Passwort via fly secrets gesetzt sein.",
      });
    }
    const hasBlaulichtCreds =
      !!data.BLAULICHTSMS_CUSTOMER_ID && !!data.BLAULICHTSMS_USER && !!data.BLAULICHTSMS_PW;
    if (!hasBlaulichtCreds) {
      issues.push({
        path: "BLAULICHTSMS_USER",
        message:
          "BlaulichtSMS-Credentials fehlen in Production — der Poller liefert leere Listen und es kommen KEINE Alarme an. Setze BLAULICHTSMS_CUSTOMER_ID/USER/PW als fly secrets oder erzwinge HOTDOC_ALLOW_INSECURE_DEFAULTS=1.",
      });
    }

    if (strict) {
      // Strict-Modus: hard-fail über Zod
      for (const issue of issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [issue.path],
          message: issue.message,
        });
      }
    } else if (issues.length > 0) {
      // Lax-Modus: console.warn vor pino startet (pino ist noch nicht initialisiert
      // beim Env-Parse). Sichtbar in fly logs, blockiert nicht.
      // eslint-disable-next-line no-console
      console.warn(
        "[hotdoc/config] PRODUKTIV-WARNUNG — folgende Konfig-Defaults sind unsicher und müssen vor echter Inbetriebnahme migriert werden:",
      );
      for (const issue of issues) {
        // eslint-disable-next-line no-console
        console.warn(`  ✗ ${issue.path}: ${issue.message}`);
      }
      // eslint-disable-next-line no-console
      console.warn(
        "[hotdoc/config] Aktivere HOTDOC_STRICT_PRODUCTION=1 sobald alles migriert ist — dann blockiert ein Default-Wert den Server-Boot.",
      );
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

/** Hilfsfunktion für Feature-Toggles (Workers nur starten wenn Credentials da). */
export function hasBlaulichtSMS(): boolean {
  return !!(env.BLAULICHTSMS_CUSTOMER_ID && env.BLAULICHTSMS_USER && env.BLAULICHTSMS_PW);
}

export function hasSyBos(): boolean {
  return !!(env.SYBOS_API_URL && env.SYBOS_TOKEN);
}

export function hasWasserkarte(): boolean {
  return !!env.WASSERKARTE_ACCESS_KEY;
}

export function hasWebPush(): boolean {
  return !!(env.VAPID_PUBLIC && env.VAPID_PRIVATE);
}
