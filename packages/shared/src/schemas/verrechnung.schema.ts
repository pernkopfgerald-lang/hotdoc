import { z } from "zod";

/**
 * Eingaben der Florianstation/des Backoffice zur Verrechnung nach der
 * Feuerwehr-Tarifordnung (am Einsatz-Doc als `verrechnung`). Die Berechnung
 * selbst steht in utils/verrechnung.ts — hier nur die persistierten Eingaben.
 * Schreiben darf ausschliesslich der Funktionaer-Endpoint
 * PUT /api/einsaetze/:id/verrechnung (nicht der normale Einsatz-PUT).
 */

const posNr = z.string().regex(/^\d{1,2}\.\d{2}$/, "Tarifposition im Format 2.04");

export const VerrechnungFzgEingabeSchema = z.object({
  minuten: z.number().int().min(1).max(60 * 24 * 14).optional(),
  nurBereitgestellt: z.boolean().optional(),
  nichtErforderlich: z.boolean().optional(),
  bemerkung: z.string().max(300).optional(),
});

export const VerrechnungZusatzSchema = z.object({
  id: z.string().min(1).max(40),
  pos: posNr,
  menge: z.number().positive().max(10000).optional(),
  minuten: z.number().int().min(1).max(60 * 24 * 14).optional(),
  betrag: z.number().min(0).max(1_000_000).optional(),
  bemerkung: z.string().max(300).optional(),
});

export const VerrechnungVerbrauchSchema = z.object({
  id: z.string().min(1).max(40),
  pos: z.enum(["14.01", "14.02", "14.03", "14.04"]),
  text: z.string().min(1).max(200),
  menge: z.number().positive().max(100000).optional(),
  betrag: z.number().min(0).max(1_000_000).optional(),
});

export const VerrechnungEingabenSchema = z.object({
  art: z.enum(["hoheitlich", "nicht-hoheitlich"]).optional(),
  fahrzeuge: z.record(z.string().max(40), VerrechnungFzgEingabeSchema).optional(),
  zusatz: z.array(VerrechnungZusatzSchema).max(50).optional(),
  verbrauch: z.array(VerrechnungVerbrauchSchema).max(50).optional(),
  bemerkung: z.string().max(1000).optional(),
  geaendertAm: z.string().optional(),
  geaendertVon: z.string().optional(),
});

export type VerrechnungEingabenDoc = z.infer<typeof VerrechnungEingabenSchema>;
