import { z } from "zod";

/**
 * Material/Gerät — gesynct aus syBOS Material.php API.
 * Siehe Spec Datenmodell 5.1.
 */

export const WatCodeSchema = z.enum([
  "atems",
  "bekle",
  "boote",
  "cont",
  "eh",
  "fuhrp",
  "gerae",
  "gt",
  "komun",
  "musik",
  "sachm",
  "tauch",
]);

export const MaterialSchema = z.object({
  _id: z.string().regex(/^material:.+$/, "Erwartet 'material:<syBOS-ID>'"),
  _rev: z.string().optional(),
  type: z.literal("material"),
  syBosId: z.number().int().positive(),
  bezeichnung: z.string(),
  klasse1: z.string().optional(),
  klasse2: z.string().optional(),
  klasse3: z.string().optional(),
  watCode: WatCodeSchema,
  /** Optional: welchem Fahrzeug ist das Gerät zugeordnet? */
  fahrzeugId: z.string().optional(),
  letztesSync: z.string().datetime(),
});

export type Material = z.infer<typeof MaterialSchema>;
export type WatCode = z.infer<typeof WatCodeSchema>;
