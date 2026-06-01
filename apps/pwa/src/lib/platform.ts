/**
 * Plattform-Abstraktions-Layer fuer Web (PWA) vs. Native (Capacitor-APK).
 *
 * Zweck: der gesamte App-Code soll `platform.*` aufrufen statt direkt
 * navigator.geolocation, localStorage etc. Im Browser greifen Browser-APIs,
 * in der APK greifen die nativen Capacitor-Plugins.
 *
 * Vorteile gegenueber direkten Browser-Calls in der APK:
 *  - Preferences statt localStorage → EncryptedSharedPreferences (Token sicher)
 *  - Network-Plugin statt navigator.onLine → reliable Online/Offline-Events
 *  - Geolocation-Plugin statt navigator.geolocation → bessere GPS-Genauigkeit,
 *    Foreground-Service-faehig
 *
 * Aktuell aktiv: secureSet/secureGet (Token), getNetworkStatus,
 * getDeviceInfo, configureStatusBar, hideSplashScreen.
 * Entfernt im Audit (verwaist): secureRemove, onNetworkChange,
 * onAppStateChange, setKeepAwake. Sind in der Git-History falls wir
 * einen Foreground-Service oder Display-Wake-Lock brauchen.
 */

import { Capacitor } from "@capacitor/core";

/** Erkennt ob wir in der APK laufen (vs. Browser-PWA). */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Lieferte die Plattform: "android" | "ios" | "web". */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}

// ─── Sichere Speicherung (Auth-Token, Fahrzeug-Konfig) ───────────────
//
// Im Web: localStorage. In der APK: EncryptedSharedPreferences via
// @capacitor/preferences. Async-API damit beide Backends matchen.

export async function secureSet(key: string, value: string): Promise<void> {
  if (isNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key, value });
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // egal — Quota / Private-Mode
  }
}

export async function secureGet(key: string): Promise<string | null> {
  if (isNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    const r = await Preferences.get({ key });
    return r.value;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// ─── Netzwerk-Status ──────────────────────────────────────────────────
//
// Anmerkung: onNetworkChange und onAppStateChange wurden im Audit als
// verwaist entfernt (kein Konsument im PWA/Backoffice). Falls die App
// spaeter eine Foreground-Service-Indikation oder Auto-Reconnect-Logik
// braucht, koennen sie aus der Git-History wiederhergestellt werden.

export interface NetworkStatus {
  connected: boolean;
  connectionType: "wifi" | "cellular" | "ethernet" | "unknown" | "none";
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  if (isNative()) {
    const { Network } = await import("@capacitor/network");
    const s = await Network.getStatus();
    return {
      connected: s.connected,
      connectionType: s.connectionType as NetworkStatus["connectionType"],
    };
  }
  return {
    connected: navigator.onLine,
    connectionType: navigator.onLine ? "unknown" : "none",
  };
}

// ─── Geraete-Info ─────────────────────────────────────────────────────

export interface DeviceInfo {
  platform: string;
  osVersion: string;
  manufacturer: string;
  model: string;
  appVersion: string;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (isNative()) {
    const { Device } = await import("@capacitor/device");
    const info = await Device.getInfo();
    let appVersion = "unknown";
    try {
      const { App } = await import("@capacitor/app");
      const v = await App.getInfo();
      appVersion = v.version;
    } catch {
      // App-Info nicht verfuegbar
    }
    return {
      platform: info.platform,
      osVersion: info.osVersion,
      manufacturer: info.manufacturer,
      model: info.model,
      appVersion,
    };
  }
  return {
    platform: "web",
    osVersion: "n/a",
    manufacturer: "n/a",
    model: navigator.userAgent.slice(0, 80),
    appVersion: "web",
  };
}

// ─── Status-Bar (nur Native) ──────────────────────────────────────────

export async function configureStatusBar(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setBackgroundColor({ color: "#C8102E" });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // StatusBar-Plugin nicht da — Default-Verhalten ist OK.
  }
}

// ─── Splash-Screen (nur Native) ───────────────────────────────────────

export async function hideSplashScreen(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    // Splash-Plugin nicht da — egal.
  }
}

