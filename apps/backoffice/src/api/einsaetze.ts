import { apiCall } from "./client";

export interface EinsatzListItem {
  _id: string;
  einsatzTyp: "alarm" | "manuell";
  einsatzort: string;
  alarmierungZeit: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  status: "aktiv" | "abgeschlossen";
  schreibschutz: boolean;
  einsatzende?: string;
  reaktivierungen?: Array<{ am: string; grund: string }>;
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

export async function manuellAnlegen(input: {
  einsatzort: string;
  einsatzart?: string;
  einsatzartFreitext?: string;
  grund?: string;
}): Promise<{ ok: boolean; id: string }> {
  return apiCall("/api/einsaetze/manuell", { method: "POST", body: input });
}

export async function triggerMockAlarm(input?: {
  einsatzort?: string;
  alarmText?: string;
}): Promise<{ ok: boolean; einsatzId: string }> {
  return apiCall("/api/dev/blaulichtsms/trigger", { method: "POST", body: input ?? {} });
}
