// Re-exports der inferierten Typen aus den Zod-Schemas.
// PWA + API importieren ausschließlich von hier (oder von @hotdoc/shared direkt).
export type {
  AuthResponse,
  Benutzer,
  LoginRequest,
  Rolle,
  TabletAuth,
  TabletRegisterRequest,
} from "../schemas/auth.schema.js";
export type {
  Einsatz,
  ChronikEintrag,
  FahrzeugPosition,
  ManuellAnlage,
  Reaktivierung,
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
