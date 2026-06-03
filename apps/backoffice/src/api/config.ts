import { apiCall } from "./client";

export type ConfigKey =
  | "auftragstypen"
  | "einsatzstichworte"
  | "geraete"
  | "stammdaten"
  | "beteiligte-stellen"
  | "sonstige-ff"
  // Issue 16 (Follow-up Einsatz-Test 2026-06-02): Liste der gefaehrlichen
  // Stoffe fuer die syBOS-Technisch-Statistik. Im Backoffice ueber den
  // gleichen StringListPanel-Editor wie beteiligte-stellen/sonstige-ff
  // pflegbar; erscheint im Florian-Editor als Chip-Mehrfachauswahl.
  | "gefaehrliche-stoffe";

export interface StringListData {
  items: string[];
}

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
  /**
   * Auto-Release-Zeit nach QR-Handoff in Stunden.
   * Erlaubte Werte: 1 / 4 / 12 / 24 / 48. 0 = nie. Default 24.
   */
  handoffAutoReleaseHours?: number;
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
