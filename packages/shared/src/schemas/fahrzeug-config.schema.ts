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
  /**
   * 2026-09: true wenn dieses Geraet sich per QR-Sticker angemeldet hat
   * (siehe QrClaim.tsx) statt per regulaerem Tablet-Setup. So ein Geraet ist
   * typischerweise ein privates Handy und NICHT das am Fahrzeug montierte
   * Tablet — dessen GPS-Position waere fuer die Live-Fahrzeugposition
   * irrefuehrend. Steuert in BerichtPage.tsx, ob GPS ueberhaupt abgefragt
   * und an /api/positions gesendet wird.
   */
  viaQr: z.boolean().optional(),
});

export type FahrzeugConfigDoc = z.infer<typeof FahrzeugConfigDocSchema>;
