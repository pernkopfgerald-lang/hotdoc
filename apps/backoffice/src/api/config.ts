import { apiCall } from "./client";

export type ConfigKey =
  | "auftragstypen"
  | "einsatzstichworte"
  | "geraete"
  | "stammdaten"
  | "tablet-pins";

export interface ConfigEnvelope<T = Record<string, unknown>> {
  ok: boolean;
  key: ConfigKey;
  data: T;
  geaendertAm: string;
}

export interface AuftragstypenData {
  items: string[];
}

export interface EinsatzstichwortItem {
  art: string;
  kategorie: "brand" | "technisch";
  /** Optional: Standard-Stufe (B-1/B-2/T-1 …) */
  standardStufe?: string;
}

export interface EinsatzstichworteData {
  items: EinsatzstichwortItem[];
}

export interface GeraetItem {
  id: string;
  bezeichnung: string;
  isOelbindemittel?: boolean;
}

export interface GeraeteData {
  byFahrzeug: Record<string, GeraetItem[]>;
}

export interface StammdatenData {
  funkrufnamen?: Record<string, string>;
  atemschutz?: { maxDauerMin: number; schritteMin: number };
  heimkoord?: { lat: number; lng: number };
  bezirk?: string;
  feuerwehrhausAdresse?: string;
}

export interface TabletPinsData {
  /** PIN je Fahrzeug-Slug (kdo / tlf-a-4000 / lfa-b / mtf / zentrale). */
  pins: Record<string, string>;
  /** Audit: Wer hat zuletzt gespeichert. */
  geaendertVon?: string;
}

export async function getConfig<T>(key: ConfigKey): Promise<ConfigEnvelope<T>> {
  return apiCall<ConfigEnvelope<T>>(`/api/config/${key}`);
}

export async function putConfig<T>(key: ConfigKey, data: T): Promise<ConfigEnvelope<T>> {
  return apiCall<ConfigEnvelope<T>>(`/api/config/${key}`, {
    method: "PUT",
    body: { data },
  });
}
