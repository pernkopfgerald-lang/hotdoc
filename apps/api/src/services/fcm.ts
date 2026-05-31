/**
 * FCM-Push-Service.
 *
 * Wird vom BlaulichtSMS-Poller aufgerufen sobald ein neuer Alarm
 * eintrifft — pusht eine high-priority Data-Message an alle
 * registrierten HotDoc-Tablets der zugewiesenen Fahrzeuge. Damit
 * waecken auch geschlossene Apps auf und zeigen die Notification.
 *
 * Implementierungs-Modus:
 *   - Wenn FCM_SERVER_KEY in env gesetzt: echte HTTP-Calls an
 *     https://fcm.googleapis.com/fcm/send
 *   - Wenn nicht: logged nur und tut nichts. Damit kann die App
 *     entwickelt werden ohne FCM-Account, und FCM-Migration ist
 *     ein reiner Env-Switch.
 *
 * Doku zur FCM-HTTP-v1-API:
 *   https://firebase.google.com/docs/cloud-messaging/migrate-v1
 *
 * Hinweis: die "legacy" /fcm/send-API wird von Google 2024+ EOL'd —
 * sobald wir produktiv gehen, sollten wir auf v1 + Service-Account-
 * Auth wechseln. Hier ist die einfachere Variante implementiert weil
 * sie ohne google-auth-library auskommt.
 */

import { db } from "../couch/client.js";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";

interface DeviceDoc {
  _id: string;
  type: "device";
  fahrzeugId: string;
  fcmToken: string;
}

interface PushPayload {
  /** Optional sichtbare Notification (Titel + Body). */
  notification?: {
    title: string;
    body: string;
  };
  /** Data-Payload — die App liest das im Background-Handler. */
  data: Record<string, string>;
}

/**
 * Liefert alle FCM-Tokens der Tablets die einem Fahrzeug zugeordnet sind.
 * Wenn fahrzeugIds leer → alle Tokens.
 */
async function listTokensFor(fahrzeugIds: string[]): Promise<DeviceDoc[]> {
  const list = await db.list({
    startkey: "device:",
    endkey: "device:￰",
    include_docs: true,
  });
  return list.rows
    .map((r) => r.doc)
    .filter(
      (d): d is DeviceDoc =>
        !!d &&
        (d as { type?: string }).type === "device" &&
        (fahrzeugIds.length === 0 ||
          fahrzeugIds.includes((d as { fahrzeugId?: string }).fahrzeugId ?? "")),
    );
}

/**
 * Schickt eine high-priority Push-Notification an alle Tablets der
 * angegebenen Fahrzeuge. Bei leerer fahrzeugIds-Liste an ALLE.
 *
 * Returnt eine Statistik (versendet/fehlgeschlagen) — der Caller kann
 * das ggf. ins Audit-Log schreiben.
 */
export async function pushAlarm(
  fahrzeugIds: string[],
  payload: PushPayload,
): Promise<{ versendet: number; fehlgeschlagen: number; uebersprungen: number }> {
  const serverKey = env.FCM_SERVER_KEY;
  const devices = await listTokensFor(fahrzeugIds);
  if (devices.length === 0) {
    logger.info({ fahrzeugIds }, "FCM-Push: keine registrierten Devices");
    return { versendet: 0, fehlgeschlagen: 0, uebersprungen: 0 };
  }
  if (!serverKey) {
    logger.warn(
      { devices: devices.length, fahrzeugIds, payload },
      "FCM-Push: FCM_SERVER_KEY nicht gesetzt — nur Mock-Log, kein echter Push",
    );
    return { versendet: 0, fehlgeschlagen: 0, uebersprungen: devices.length };
  }

  let ok = 0;
  let fail = 0;
  for (const device of devices) {
    try {
      const body = {
        to: device.fcmToken,
        priority: "high",
        ...(payload.notification ? { notification: payload.notification } : {}),
        data: payload.data,
        // android-spezifisches Behaviour: wake up auch im Doze-Mode
        android: {
          priority: "high",
          ttl: "60s",
        },
      };
      const res = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          Authorization: `key=${serverKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.warn(
          { status: res.status, deviceId: device._id, body: text.slice(0, 200) },
          "FCM-Push fehlgeschlagen",
        );
        fail++;
        continue;
      }
      const json = (await res.json()) as { success?: number; failure?: number };
      if ((json.failure ?? 0) > 0) {
        logger.warn({ deviceId: device._id, json }, "FCM-Push partial failure");
        fail++;
        continue;
      }
      ok++;
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), deviceId: device._id },
        "FCM-Push-Exception",
      );
      fail++;
    }
  }
  logger.info({ ok, fail, total: devices.length, fahrzeugIds }, "FCM-Push abgeschlossen");
  return { versendet: ok, fehlgeschlagen: fail, uebersprungen: 0 };
}
