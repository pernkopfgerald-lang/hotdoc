import { z } from "zod";

/**
 * Foto-Funktion (2026-06-03): Einsatz-Foto, aufgenommen am Fahrzeug-Tablet
 * über die Einsatzchronik.
 *
 * Architektur-Entscheidung: Fotos liegen in EIGENEN Docs (nicht im Einsatz-
 * oder Fahrzeugbericht-Doc), weil:
 *   - der 8-s-Chronik-Cross-Sync sonst megabyteweise Bilddaten über das
 *     (Funkloch-)Netz schieben würde,
 *   - der Hauptbericht-Doc-Read sonst alle Bilder mitladen müsste,
 *   - die Offline-Outbox einzelne Fotos gezielt nachreichen kann.
 *
 * Der Bild-Body ist eine client-seitig komprimierte JPEG-Data-URL (~1600px
 * lange Kante, ~300–500 KB) — gut genug für den 9×12-cm-Druck im Anhang, aber
 * klein genug für Offline-Pufferung + Funkloch-Upload.
 *
 * Doc-ID-Muster: `foto:<einsatzId-suffix>:<fahrzeugId>:<uuid>`
 * Der Chronik-Eintrag referenziert das Foto über `fotoId` (= diese _id).
 */
export const FotoSchema = z.object({
  _id: z.string().regex(/^foto:.+$/, "Erwartet 'foto:<einsatzId>:<fahrzeugId>:<uuid>'"),
  _rev: z.string().optional(),
  type: z.literal("foto"),

  einsatzId: z.string(),
  fahrzeugId: z.string(),

  /** Komprimierte JPEG-Data-URL (data:image/jpeg;base64,…). */
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/, "Erwartet Bild-Data-URL"),
  /** Optionaler Beschreibungstext (z. B. „Brandausbruchstelle Keller"). */
  beschreibung: z.string().max(500).optional(),

  aufgenommenAm: z.string().datetime({ offset: true }),
  /** Wer hat es aufgenommen — Funkrufname des Fahrzeugs. */
  aufgenommenVon: z.string().optional(),

  erstelltAm: z.string().datetime({ offset: true }),
  geaendertAm: z.string().datetime({ offset: true }),
});

export type Foto = z.infer<typeof FotoSchema>;
