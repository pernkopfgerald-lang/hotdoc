/**
 * TypeScript-Wrapper für das Custom-Capacitor-Plugin "ApkInstaller".
 *
 * Im Web (Browser-PWA) tut alles nichts und gibt sinnvolle Defaults
 * zurück — der UpdateBanner fällt dann auf window.open zurück.
 *
 * Plugin-Implementierung:
 *   apps/pwa/android/app/src/main/java/at/ffeberstalzell/hotdoc/
 *   ApkInstallerPlugin.java
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export interface DownloadProgressEvent {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface ApkInstallerPlugin {
  /** Prüft die "Aus unbekannten Quellen installieren"-Permission. */
  canInstallApks(): Promise<{ allowed: boolean }>;
  /** Öffnet System-Settings-Screen für die Permission. */
  openInstallPermissionSettings(): Promise<void>;
  /** Lädt die APK runter und triggert den Android-PackageInstaller. */
  downloadAndInstall(opts: { url: string }): Promise<{
    installerLaunched: boolean;
    downloadedBytes: number;
  }>;
  /** Listener für Download-Progress. */
  addListener(
    eventName: "downloadProgress",
    listener: (event: DownloadProgressEvent) => void,
  ): Promise<{ remove(): Promise<void> }>;
}

const native = registerPlugin<ApkInstallerPlugin>("ApkInstaller");

export function isApkInstallerAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

/**
 * High-Level-API: prüft Permission, fordert ggf. an, lädt APK runter
 * und triggert Install-Intent. Im Web macht es einen window.open
 * Fallback — funktioniert dort aber nicht ohne User-Interaction wegen
 * Pop-up-Blocker. Daher sollte der Caller vorher prüfen mit
 * isApkInstallerAvailable() und auf der Web-Variante einen direkten
 * Link rendern.
 */
export async function installApkUpdate(opts: {
  url: string;
  onProgress?: (event: DownloadProgressEvent) => void;
}): Promise<{
  status: "installer-launched" | "permission-required" | "web-fallback" | "error";
  message?: string;
}> {
  if (!isApkInstallerAvailable()) {
    window.open(opts.url, "_blank");
    return { status: "web-fallback" };
  }

  // Permission-Check
  try {
    const perm = await native.canInstallApks();
    if (!perm.allowed) {
      await native.openInstallPermissionSettings();
      return {
        status: "permission-required",
        message:
          "Bitte 'Apps aus dieser Quelle erlauben' aktivieren und erneut klicken.",
      };
    }
  } catch {
    // Wenn der Permission-Check selbst failt (z.B. unter API 26
    // duerfte das nicht passieren), gehen wir trotzdem weiter — der
    // Download-Aufruf wird dann mit klarer Meldung scheitern.
  }

  // Progress-Listener registrieren (optional)
  let removeListener: (() => Promise<void>) | undefined;
  if (opts.onProgress) {
    const handle = await native.addListener("downloadProgress", opts.onProgress);
    removeListener = () => handle.remove();
  }

  try {
    await native.downloadAndInstall({ url: opts.url });
    return { status: "installer-launched" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("INSTALL_PERMISSION_REQUIRED")) {
      await native.openInstallPermissionSettings().catch(() => undefined);
      return {
        status: "permission-required",
        message:
          "Permission noch nicht aktiv. Bitte in Einstellungen erlauben und erneut starten.",
      };
    }
    return { status: "error", message: msg };
  } finally {
    if (removeListener) await removeListener();
  }
}
