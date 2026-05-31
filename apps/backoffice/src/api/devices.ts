import { apiCall } from "./client";

export interface DeviceListItem {
  _id: string;
  fahrzeugId: string;
  deviceUuid: string;
  platform: "android" | "ios" | "web";
  manufacturer: string;
  model: string;
  osVersion: string;
  appVersion: string;
  letztesUpdateAm: string;
  erstelltAm: string;
  /** Server liefert nur Preview (12 Zeichen + … + 6 Zeichen). */
  fcmTokenPreview: string;
}

export async function listDevices(): Promise<DeviceListItem[]> {
  const r = await apiCall<{ ok: boolean; items: DeviceListItem[] }>("/api/devices");
  return r.items;
}

export async function deleteDevice(id: string): Promise<void> {
  await apiCall(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export interface AppVersionConfig {
  currentVersion: string;
  apkUrl: string;
  releaseNotes: string;
  minSupported: string;
}

export async function getAppVersionConfig(): Promise<AppVersionConfig> {
  const r = await apiCall<{ ok: boolean; data?: AppVersionConfig } & AppVersionConfig>(
    "/api/config/app-version",
  );
  // config/:key liefert envelope {ok, data, geaendertAm}
  const data = r.data;
  if (data) return data;
  // Fallback wenn key noch nicht angelegt ist
  return {
    currentVersion: "0.0.0",
    apkUrl: "",
    releaseNotes: "",
    minSupported: "0.0.0",
  };
}

export async function setAppVersionConfig(c: AppVersionConfig): Promise<void> {
  await apiCall("/api/config/app-version", {
    method: "PUT",
    body: { data: c },
  });
}
