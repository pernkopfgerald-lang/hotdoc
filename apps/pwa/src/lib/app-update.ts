/**
 * In-App-Update-Mechanismus fuer die HotDoc-Android-APK.
 *
 * Flow:
 *   1. Beim App-Start (und alle 6 h) pollen wir /api/devices/app-version.
 *   2. Wenn Server-Version > installierte Version + APK-URL bekannt:
 *      Benutzer bekommt einen unaufdringlichen "Update verfuegbar"-Hinweis
 *      mit den Release-Notes. Klick öffnet die APK-URL im Default-Browser
 *      (Capacitor Browser-Plugin nicht noetig — App.openUrl reicht).
 *   3. Browser/PackageInstaller fuehrt die Installation aus — User
 *      bestaetigt einmalig "Installation aus dieser Quelle erlauben".
 *   4. Nach Update startet die App mit neuer Version, registriert sich
 *      via /api/devices/register mit neuer appVersion und der Cycle
 *      ist sauber.
 *
 * Im Web (PWA) tut dieser Layer nichts — Web-Updates kommen ueber
 * den Service-Worker.
 */

import { Capacitor } from "@capacitor/core";

export interface AppVersionInfo {
  currentVersion: string;
  apkUrl: string;
  releaseNotes: string;
  minSupported: string;
}

/** Vergleicht zwei semver-Strings (a > b → 1, a < b → -1, gleich → 0). */
function semverCompare(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/** Holt die aktuell installierte App-Version vom Capacitor App-Plugin.
 *  Nur intern fuer checkForUpdate verwendet — kein Re-Export. */
async function getInstalledVersion(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return "web";
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    return info.version;
  } catch {
    return "unknown";
  }
}

/** Pollt die Server-Version und prueft ob ein Update verfuegbar ist. */
export async function checkForUpdate(
  apiBase: string,
  authToken: string,
): Promise<{
  updateAvailable: boolean;
  current: string;
  latest: string;
  apkUrl: string;
  releaseNotes: string;
}> {
  const installed = await getInstalledVersion();
  if (installed === "web") {
    return {
      updateAvailable: false,
      current: "web",
      latest: "web",
      apkUrl: "",
      releaseNotes: "",
    };
  }
  try {
    const res = await fetch(`${apiBase}/api/devices/app-version`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { ok: boolean } & AppVersionInfo;
    const updateAvailable =
      !!body.apkUrl && semverCompare(body.currentVersion, installed) > 0;
    return {
      updateAvailable,
      current: installed,
      latest: body.currentVersion,
      apkUrl: body.apkUrl,
      releaseNotes: body.releaseNotes,
    };
  } catch {
    return {
      updateAvailable: false,
      current: installed,
      latest: installed,
      apkUrl: "",
      releaseNotes: "",
    };
  }
}

