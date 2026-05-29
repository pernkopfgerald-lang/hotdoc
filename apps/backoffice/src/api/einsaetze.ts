import { apiCall } from "./client";

export type EinsatzTyp = "alarm" | "manuell" | "lotsendienst" | "uebung";

export type UebungsTyp =
  | "Atemschutz"
  | "Technische Hilfeleistung"
  | "Höhenrettung"
  | "Sanitätsdienst"
  | "Funk"
  | "Allgemeine Übung"
  | "Bewerb"
  | "Sonstige";

export interface EinsatzListItem {
  _id: string;
  einsatzTyp: EinsatzTyp;
  einsatzort: string;
  alarmierungZeit: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  status: "aktiv" | "abgeschlossen";
  schreibschutz: boolean;
  einsatzende?: string;
  reaktivierungen?: Array<{ am: string; grund: string }>;
  koordinaten?: { lat: number; lng: number };
  lotsendienstAuftraggeber?: string;
  lotsendienstRoute?: string;
  uebungThema?: string;
  uebungsleiter?: string;
  uebungsTyp?: UebungsTyp;
}

export async function listEinsaetze(status?: "aktiv" | "abgeschlossen"): Promise<EinsatzListItem[]> {
  const path = status ? `/api/einsaetze?status=${status}` : "/api/einsaetze";
  const r = await apiCall<{ items: EinsatzListItem[] }>(path);
  return r.items;
}

export async function getEinsatz(id: string): Promise<EinsatzListItem & Record<string, unknown>> {
  return apiCall(`/api/einsaetze/${encodeURIComponent(id)}`);
}

export async function abschluss(id: string): Promise<{ ok: boolean }> {
  return apiCall(`/api/einsaetze/${encodeURIComponent(id)}/abschluss`, { method: "POST" });
}

export async function reaktivieren(id: string, grund: string): Promise<{ ok: boolean }> {
  return apiCall(`/api/einsaetze/${encodeURIComponent(id)}/reaktivieren`, {
    method: "POST",
    body: { grund },
  });
}

export interface ManuellAnlageInput {
  einsatzTyp?: "manuell" | "lotsendienst" | "uebung";
  einsatzort: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  grund?: string;
  // Lotsendienst-Felder
  lotsendienstAuftraggeber?: string;
  lotsendienstRoute?: string;
  // Übungs-Felder
  uebungThema?: string;
  uebungsleiter?: string;
  uebungsTyp?: UebungsTyp;
  // Verrechnung (für Lotsendienst meist true)
  verrechenbar?: boolean;
  rechnungsadresse?: string;
}

export async function manuellAnlegen(input: ManuellAnlageInput): Promise<{ ok: boolean; id: string }> {
  return apiCall("/api/einsaetze/manuell", { method: "POST", body: input });
}
