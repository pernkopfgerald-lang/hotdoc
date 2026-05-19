// Re-exports der inferierten Typen aus den Zod-Schemas.
// PWA + API importieren ausschließlich von hier (oder von @hotdoc/shared direkt).
export type {
  Einsatz,
  ChronikEintrag,
  FahrzeugPosition,
} from "../schemas/einsatz.schema.js";
export type { FahrzeugConfigDoc } from "../schemas/fahrzeug-config.schema.js";
export type {
  Fahrzeugbericht,
  MannschaftEintrag,
  GeraetUseage,
} from "../schemas/fahrzeugbericht.schema.js";
export type { Hydrant, HydrantTyp } from "../schemas/hydrant.schema.js";
export type { Material, WatCode } from "../schemas/material.schema.js";
export type { Person } from "../schemas/person.schema.js";
