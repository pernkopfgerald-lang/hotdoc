import { z } from "zod";

/**
 * Strenge Validierung aller env-Variablen beim Start.
 * Failt sofort wenn etwas fehlt — kein silent Fallback.
 */
const EnvSchema = z.object({
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

  // WebPush (VAPID) — Phase 3
  VAPID_PUBLIC: z.string().optional(),
  VAPID_PRIVATE: z.string().optional(),
  VAPID_SUBJECT: z.string().email().default("admin@ff-eberstalzell.at"),

  // OpenAI Whisper Fallback — Phase 5
  OPENAI_API_KEY: z.string().optional(),

  // Audio-Retention — Phase 8
  AUDIO_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Auth — Phase 3
  JWT_SECRET: z.string().min(32).default("dev-secret-bitte-in-production-ueberschreiben-mit-fly-secrets"),
  /** Cookie-Name für Backoffice-Session. */
  AUTH_COOKIE_NAME: z.string().default("hotdoc.session"),
  /** Session-Lebensdauer in Sekunden (default 8h). */
  SESSION_TTL_SEC: z.coerce.number().int().positive().default(8 * 60 * 60),
  /** Initial-Admin-Anmeldung beim Server-Start auto-anlegen, falls keine Benutzer existieren. */
  BOOTSTRAP_ADMIN_USERNAME: z.string().default("admin"),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default("admin12345678"),
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
