import { z } from "zod";

/**
 * Löschwasserentnahmestelle (Hydrant / Saugstelle / Tieflöschwasser).
 * Gesynct aus wasserkarte.info via Access-Key, Backend-Cache.
 * Siehe Spec FR-11.
 */

export const HydrantTypSchema = z.enum(["H", "S", "T"]); // Hydrant, Saugstelle, Tieflöschwasser

export const HydrantSchema = z.object({
  _id: z.string().regex(/^hydrant:.+$/, "Erwartet 'hydrant:<externalId>'"),
  _rev: z.string().optional(),
  type: z.literal("hydrant"),
  externalId: z.string(),
  typ: HydrantTypSchema,
  lat: z.number(),
  lng: z.number(),
  bezeichnung: z.string().optional(),
  leistungLProMin: z.number().int().optional(),
  letztePruefung: z.string().date().optional(),
  letztesSync: z.string().datetime(),
});

export type Hydrant = z.infer<typeof HydrantSchema>;
export type HydrantTyp = z.infer<typeof HydrantTypSchema>;
