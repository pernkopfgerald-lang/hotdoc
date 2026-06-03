import { z } from "zod";
import { AS_MAX, AS_MIN } from "../constants/atemschutz.js";

/**
 * Fahrzeugbericht — pro eingesetztem Fahrzeug einer.
 * Siehe Spec Datenmodell 5.1 und Anhang A.
 */

// RISIKO-1 (Audit 2026-06-03): Alle z.string().datetime() in dieser Datei
// tragen jetzt { offset: true } — siehe ausfuehrliche Begruendung in
// einsatz.schema.ts. Akzeptiert UTC "Z" UND TZ-Offset "+02:00" (Sommerzeit
// bei TZ=Europe/Vienna), damit der Fahrzeugbericht-Round-Trip Read→Write
// nicht an strikter datetime-Validierung scheitert.
export const MannschaftEintragSchema = z.object({
  slot: z.number().int().min(1).max(7),
  personId: z.number().int().positive(),
  atemschutzAktiv: z.boolean().default(false),
  atemschutzDauerMin: z
    .number()
    .int()
    .min(AS_MIN)
    .max(AS_MAX)
    .optional(),
});

export const GeraetUseageSchema = z.object({
  materialId: z.string(),
  anzahl: z.number().int().min(1).optional(),
  bemerkung: z.string().optional(),
});

export const FotoRefSchema = z.object({
  blobId: z.string(),
  beschreibung: z.string().optional(),
  aufgenommenAm: z.string().datetime({ offset: true }),
});

export const GpsPunktSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  t: z.string().datetime({ offset: true }),
  accuracy: z.number().optional(),
});

export const FahrzeugberichtSchema = z.object({
  _id: z.string().regex(/^fzgber:.+:.+$/, "Erwartet 'fzgber:<einsatzId>:<fahrzeugId>'"),
  _rev: z.string().optional(),
  type: z.literal("fahrzeugbericht"),

  einsatzId: z.string(),
  fahrzeugId: z.string(),

  zeit: z.object({
    von: z.string().datetime({ offset: true }).optional(),
    bis: z.string().datetime({ offset: true }).optional(),
  }),

  km: z.object({
    abfahrt: z.number().optional(),
    /** Automatisch aus GPS-Track aggregiert (Haversine, geglättet). */
    gefahrenKm: z.number().min(0).default(0),
    rueckkehr: z.number().optional(),
  }),

  /** Optional: GPS-Track für Audit/Analyse, nicht im PDF. */
  gpsTrack: z.array(GpsPunktSchema).default([]),

  fahrerPersonId: z.number().int().optional(),
  fahrzeugKdtPersonId: z.number().int().optional(),

  /**
   * Issue 12 (Einsatz-Test 2026-06-02): Markiert, ob der Fahrzeug-Kdt
   * dieses Berichts gleichzeitig auch der Einsatzleiter des gesamten
   * Einsatzes ist. Die Florianstation aggregiert ueber alle
   * Fahrzeugberichte und warnt, wenn 0 oder >1 EL gesetzt sind.
   * PDF zeigt einen `*` neben dem EL-Namen.
   *
   * Backwards-Compat: optional damit Bestandsberichte vor v0.1.10
   * weiter valide bleiben (kein EL = undefined).
   */
  kdtIstEinsatzleiter: z.boolean().optional(),

  /**
   * Issue 8 (Einsatz-Test 2026-06-02): Verrechnungs-Stand wird beim
   * Hauptauftrag-Abschluss auf alle Fahrzeugberichte gespiegelt.
   * Vorher musste der Sachbearbeiter pro Bericht haendisch markieren.
   */
  verrechnung: z
    .object({
      verrechenbar: z.boolean().default(false),
      rechnungsadresse: z.string().optional(),
    })
    .optional(),

  mannschaft: z.array(MannschaftEintragSchema).default([]),

  /** Nur MTF: welche Anhänger wurden mitgenommen? */
  anhaengerMitgenommen: z.array(z.enum(["HR-Anhaenger", "PKW-Anhaenger"])).optional(),

  geraete: z.array(GeraetUseageSchema).default([]),

  /** Ölbindemittel-Säcke — wird im Hauptbericht aggregiert (verrechenbar). */
  oelbindemittelSaecke: z.number().int().min(0).max(99).default(0),

  taetigkeitsbericht: z.string().default(""),

  fotos: z.array(FotoRefSchema).default([]),

  status: z.enum(["in_arbeit", "abgeschlossen"]).default("in_arbeit"),

  erstelltAm: z.string().datetime({ offset: true }),
  geaendertAm: z.string().datetime({ offset: true }),
});

export type Fahrzeugbericht = z.infer<typeof FahrzeugberichtSchema>;
export type MannschaftEintrag = z.infer<typeof MannschaftEintragSchema>;
export type GeraetUseage = z.infer<typeof GeraetUseageSchema>;
