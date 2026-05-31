/**
 * Auto-Registration des Tablets beim Backend.
 *
 * Wird beim App-Start aufgerufen sobald ein gueltiger Auth-Token vorhanden
 * ist. Die App schickt:
 *   - deviceUuid (lokal generiert, stabil pro Installation in IndexedDB
 *     gespeichert) — ueberlebt App-Updates, geht bei Reinstall verloren
 *   - fcmToken (in Phase 1 leer, wird in Phase 2 nach FCM-Setup gefuellt)
 *   - Geraete-Info via @capacitor/device
 *   - appVersion via @capacitor/app
 *
 * Im Browser-PWA wird platform=web mitgeschickt — der Server speichert das
 * trotzdem, ist aber fuer FCM-Push nicht relevant (kein Token). So sieht
 * der Funktionaer im Backoffice auch welche PWA-Tablets aktiv sind.
 *
 * Re-Register-Cadence:
 *   - bei jedem App-Start (App-Version kann sich geaendert haben)
 *   - alle 24h (refresht das letztesUpdateAm-Feld, Last-Seen-Anzeige)
 */

import { apiCall } from "./api";
import { getDeviceInfo, isNative, secureGet, secureSet } from "./platform";

const DEVICE_UUID_KEY = "hotdoc.deviceUuid";

/** Erzeugt oder liest die persistente Device-UUID. */
async function getOrCreateDeviceUuid(): Promise<string> {
  const existing = await secureGet(DEVICE_UUID_KEY);
  if (existing) return existing;
  const uuid = crypto.randomUUID();
  await secureSet(DEVICE_UUID_KEY, uuid);
  return uuid;
}

interface PushPluginModule {
  PushNotifications: {
    requestPermissions(): Promise<{ receive: string }>;
    register(): Promise<void>;
    addListener(
      event: "registration",
      cb: (token: { value: string }) => void,
    ): Promise<{ remove(): Promise<void> }>;
  };
}

/** FCM-Token holen — nur Native + nur wenn das PushPlugin verfuegbar ist.
 *  Das Plugin wird via dynamic-import geladen damit der PWA-Build auch ohne
 *  installiertes @capacitor/push-notifications kompiliert (Phase 2 Add-On). */
async function getFcmTokenIfPossible(): Promise<string> {
  if (!isNative()) return "";
  try {
    const mod = (await import("@capacitor/push-notifications").catch(
      () => null,
    )) as PushPluginModule | null;
    if (!mod) return "";
    const { PushNotifications } = mod;
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return "";
    return await new Promise<string>((resolve) => {
      const handlePromise = PushNotifications.addListener("registration", (token) => {
        resolve(token.value);
        void handlePromise.then((h) => h.remove());
      });
      void PushNotifications.register();
      setTimeout(() => resolve(""), 5000);
    });
  } catch {
    return "";
  }
}

/**
 * Registriert das Tablet beim Backend. Idempotent — jede Re-Registration
 * ueberschreibt den existierenden Eintrag mit neuen Werten.
 *
 * Returnt true bei Erfolg, false bei Fehler / fehlender Auth.
 */
export async function registerDevice(): Promise<boolean> {
  try {
    const [deviceUuid, info, fcmToken] = await Promise.all([
      getOrCreateDeviceUuid(),
      getDeviceInfo(),
      getFcmTokenIfPossible(),
    ]);
    // Server akzeptiert leeren fcmToken NICHT (Schema verlangt min 20 Zeichen).
    // Wir schicken in dem Fall einen Platzhalter und markieren das mit dem
    // appVersion-Suffix damit der Funktionaer im Backoffice sieht dass das
    // Tablet noch keinen FCM-Token registriert hat. Bei PWA (web) ist das
    // OK — die Tablet-Liste zeigt sie trotzdem an.
    const body = {
      deviceUuid,
      fcmToken: fcmToken || `no-fcm-${deviceUuid.substring(0, 8)}`,
      platform: info.platform === "android" || info.platform === "ios"
        ? info.platform
        : "android",
      manufacturer: info.manufacturer || "unknown",
      model: info.model || "unknown",
      osVersion: info.osVersion || "unknown",
      appVersion: info.appVersion || "0.1.0",
    };
    await apiCall("/api/devices/register", {
      method: "POST",
      body,
    });
    console.info("[device-register] OK", {
      deviceUuid,
      platform: body.platform,
      fcmAvailable: !!fcmToken,
    });
    return true;
  } catch (err) {
    console.warn("[device-register] failed:", err);
    return false;
  }
}
