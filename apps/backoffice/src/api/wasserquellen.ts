import { apiCall } from "./client";

export interface Wasserquelle {
  id: string;
  name: string;
  typ: "H" | "S" | "T";
  typLabel: string;
  anschluss: string;
  lat: number;
  lng: number;
}

export interface WasserquellenListResponse {
  ok: boolean;
  count: number;
  importedAm: string | null;
  items: Wasserquelle[];
}

export interface WasserquellenImportResponse {
  ok: boolean;
  anzahl: number;
  entfernt: number;
  iconsFehlend: number;
  fehler: number;
  importedAm: string;
}

export function getWasserquellen(): Promise<WasserquellenListResponse> {
  return apiCall<WasserquellenListResponse>("/api/wasserquellen");
}

/**
 * Ersetzt den kompletten Datenbestand durch die hochgeladene KML — kann bei
 * 300+ Objekten (Icon-Downloads von portal.wasserkarte.info) einige Sekunden
 * dauern. `client.ts`s `apiCall` setzt keinen eigenen Timeout, laeuft also
 * bis zur Serverantwort durch.
 */
export function importWasserquellenKml(
  kml: string,
  dateiname?: string,
): Promise<WasserquellenImportResponse> {
  return apiCall<WasserquellenImportResponse>("/api/wasserquellen/import", {
    method: "POST",
    body: { kml, ...(dateiname ? { dateiname } : {}) },
  });
}
