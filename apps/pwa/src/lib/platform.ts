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
 *  - KeepAwake → Display bleibt waehrend Einsatz an, ohne CSS-Hack
 *  - App-Plugin → echte AppState-Events (Active/Background) statt visibility
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

export async function secureRemove(key: string): Promise<void> {
  if (isNative()) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key });
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // egal
  }
}

// ─── Netzwerk-Status ──────────────────────────────────────────────────

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

export async function onNetworkChange(
  cb: (s: NetworkStatus) => void,
): Promise<() => void> {
  if (isNative()) {
    const { Network } = await import("@capacitor/network");
    const handle = await Network.addListener("networkStatusChange", (s) => {
      cb({
        connected: s.connected,
        connectionType: s.connectionType as NetworkStatus["connectionType"],
      });
    });
    return () => {
      void handle.remove();
    };
  }
  const handler = (): void => {
    cb({
      connected: navigator.onLine,
      connectionType: navigator.onLine ? "unknown" : "none",
    });
  };
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
}

// ─── App-State (Foreground/Background) ───────────────────────────────

export type AppState = "active" | "background";

export async function onAppStateChange(
  cb: (state: AppState) => void,
): Promise<() => void> {
  if (isNative()) {
    const { App } = await import("@capacitor/app");
    const handle = await App.addListener("appStateChange", (s) => {
      cb(s.isActive ? "active" : "background");
    });
    return () => {
      void handle.remove();
    };
  }
  const handler = (): void => {
    cb(document.visibilityState === "visible" ? "active" : "background");
  };
  document.addEventListener("visibilitychange", handler);
  return () => {
    document.removeEventListener("visibilitychange", handler);
  };
}

// ─── Display wach halten (Wake-Lock) ─────────────────────────────────
//
// Waehrend eines aktiven Einsatzes soll das Tablet-Display nicht
// dimmen / sperren. Auf Native via KeepAwake-Plugin (WindowManager-
// FLAG_KEEP_SCREEN_ON), im Browser via WakeLock-API (ungewiss auf
// alten Android-Versionen).

let webWakeLockSentinel: WakeLockSentinel | null = null;

export async function setKeepAwake(enabled: boolean): Promise<void> {
  if (isNative()) {
    const { KeepAwake } = await import("@capacitor-community/keep-awake");
    if (enabled) await KeepAwake.keepAwake();
    else await KeepAwake.allowSleep();
    return;
  }
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> };
    };
    if (enabled) {
      const lock = await nav.wakeLock?.request("screen");
      webWakeLockSentinel = lock ?? null;
    } else if (webWakeLockSentinel) {
      await webWakeLockSentinel.release();
      webWakeLockSentinel = null;
    }
  } catch {
    // WakeLock auf altem Android nicht verfuegbar — egal, soll nicht crashen.
  }
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

declare global {
  /** Webview-WakeLock-Typ (DOM-Lib hat ihn nicht in alle Versionen). */
  interface WakeLockSentinel {
    release(): Promise<void>;
  }
}
