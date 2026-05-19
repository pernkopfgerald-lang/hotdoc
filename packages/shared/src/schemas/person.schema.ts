import { z } from "zod";

/**
 * Person — gesynct aus syBOS Personal.php API.
 * Siehe Spec Datenmodell 5.1.
 */
export const PersonSchema = z.object({
  _id: z.string().regex(/^person:\d+$/, "Erwartet 'person:<syBOS-ID>'"),
  _rev: z.string().optional(),
  type: z.literal("person"),
  syBosId: z.number().int().positive(),
  nachname: z.string().min(1),
  vorname: z.string().min(1),
  dienstgrad: z.string(),
  email: z.string().email().optional(),
  mobil1: z.string().optional(),
  mobil2: z.string().optional(),
  funktionen: z.array(z.string()).default([]),
  atemschutzGueltig: z.boolean().default(false),
  /** Filter: nur Personen mit aktiv=true werden in Pickern angezeigt. */
  aktiv: z.boolean(),
  letztesSync: z.string().datetime(),
});

export type Person = z.infer<typeof PersonSchema>;
