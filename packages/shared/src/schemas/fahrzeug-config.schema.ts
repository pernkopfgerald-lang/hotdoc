import { z } from "zod";

/**
 * Fahrzeug-Konfiguration pro Tablet (lokal, Setup-Screen).
 * Siehe Spec Datenmodell 5.1 und FAHRZEUGE-Constant.
 */

export const FahrzeugConfigDocSchema = z.object({
  _id: z.literal("fahrzeug:self"),
  _rev: z.string().optional(),
  type: z.literal("fahrzeug-config"),
  fahrzeugId: z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf", "zentrale"]),
  /** Tablet-Identifier (UUID, beim Setup vergeben). */
  tabletDeviceId: z.string().uuid(),
  setupAm: z.string().datetime(),
});

export type FahrzeugConfigDoc = z.infer<typeof FahrzeugConfigDocSchema>;
