import { z } from "zod";
import { AS_MAX, AS_MIN } from "../constants/atemschutz.js";

/**
 * Fahrzeugbericht — pro eingesetztem Fahrzeug einer.
 * Siehe Spec Datenmodell 5.1 und Anhang A.
 */

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
  aufgenommenAm: z.string().datetime(),
});

export const GpsPunktSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  t: z.string().datetime(),
  accuracy: z.number().optional(),
});

export const FahrzeugberichtSchema = z.object({
  _id: z.string().regex(/^fzgber:.+:.+$/, "Erwartet 'fzgber:<einsatzId>:<fahrzeugId>'"),
  _rev: z.string().optional(),
  type: z.literal("fahrzeugbericht"),

  einsatzId: z.string(),
  fahrzeugId: z.string(),

  zeit: z.object({
    von: z.string().datetime().optional(),
    bis: z.string().datetime().optional(),
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

  mannschaft: z.array(MannschaftEintragSchema).default([]),

  /** Nur MTF: welche Anhänger wurden mitgenommen? */
  anhaengerMitgenommen: z.array(z.enum(["HR-Anhaenger", "PKW-Anhaenger"])).optional(),

  geraete: z.array(GeraetUseageSchema).default([]),

  /** Ölbindemittel-Säcke — wird im Hauptbericht aggregiert (verrechenbar). */
  oelbindemittelSaecke: z.number().int().min(0).max(99).default(0),

  taetigkeitsbericht: z.string().default(""),

  fotos: z.array(FotoRefSchema).default([]),

  status: z.enum(["in_arbeit", "abgeschlossen"]).default("in_arbeit"),

  erstelltAm: z.string().datetime(),
  geaendertAm: z.string().datetime(),
});

export type Fahrzeugbericht = z.infer<typeof FahrzeugberichtSchema>;
export type MannschaftEintrag = z.infer<typeof MannschaftEintragSchema>;
export type GeraetUseage = z.infer<typeof GeraetUseageSchema>;
