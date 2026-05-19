import { z } from "zod";

/**
 * Auth-Schemas — FR-15.
 *
 * Zwei Login-Mechanismen:
 *   1. Tablets (Fahrzeuge + Zentrale): MSISDN-basiert (SIM-Karte ist unique pro Fahrzeug)
 *   2. Backoffice/Florianstation (Windows PC): Username + Passwort
 *
 * Rollen-Hierarchie: mannschaft < einsatzleiter < funktionaer < admin
 */

export const RolleSchema = z.enum(["mannschaft", "einsatzleiter", "funktionaer", "admin"]);
export type Rolle = z.infer<typeof RolleSchema>;

/** Backoffice-Benutzer (PC-Login via Username + Passwort). */
export const BenutzerSchema = z.object({
  _id: z.string().regex(/^user:.+$/, "Erwartet 'user:<uuid>'"),
  _rev: z.string().optional(),
  type: z.literal("benutzer"),
  username: z.string().min(3).max(50),
  /** bcrypt-Hash, nie im Klartext gespeichert. */
  passwordHash: z.string(),
  rolle: RolleSchema,
  /** Optional: verknüpfte syBOS-Person für Audit-Trail-Anzeige. */
  verknuepftePersonId: z.number().int().optional(),
  email: z.string().email().optional(),
  aktiv: z.boolean().default(true),
  erstelltAm: z.string().datetime(),
  letzterLogin: z.string().datetime().optional(),
});

export type Benutzer = z.infer<typeof BenutzerSchema>;

/** Tablet-Auth (SIM-basiert, eine Konfiguration pro Tablet). */
export const TabletAuthSchema = z.object({
  _id: z.string().regex(/^tablet:.+$/, "Erwartet 'tablet:<deviceId>'"),
  _rev: z.string().optional(),
  type: z.literal("tablet-auth"),
  /** Eindeutige Device-UUID, beim Setup erzeugt. */
  deviceId: z.string().uuid(),
  /** Mobilfunknummer der SIM, +43… Format. Unique pro Fahrzeug. */
  msisdn: z.string().regex(/^\+\d{8,15}$/, "MSISDN im internationalen Format erwartet"),
  fahrzeugId: z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf", "zentrale"]),
  /** Random-Token, wird bei jedem API-Call mitgeschickt. */
  deviceToken: z.string().min(32),
  tokenAusgestelltAm: z.string().datetime(),
  letzterZugriff: z.string().datetime().optional(),
  aktiv: z.boolean().default(true),
});

export type TabletAuth = z.infer<typeof TabletAuthSchema>;

/** Request-Body für Backoffice-Login. */
export const LoginRequestSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** Request-Body für Tablet-Registrierung (Setup-Step). */
export const TabletRegisterRequestSchema = z.object({
  msisdn: z.string().regex(/^\+\d{8,15}$/),
  fahrzeugId: z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf", "zentrale"]),
  deviceId: z.string().uuid(),
});

export type TabletRegisterRequest = z.infer<typeof TabletRegisterRequestSchema>;

/** Response für erfolgreichen Login (Backoffice oder Tablet). */
export const AuthResponseSchema = z.object({
  ok: z.literal(true),
  rolle: RolleSchema,
  token: z.string(),
  expiresAt: z.string().datetime(),
  benutzer: z
    .object({
      username: z.string(),
      verknuepftePersonId: z.number().int().optional(),
    })
    .optional(),
  fahrzeugId: z.string().optional(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
