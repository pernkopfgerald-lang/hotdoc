/**
 * FCM-Push-Service (HTTP v1 API).
 *
 * Wird vom BlaulichtSMS-Poller aufgerufen sobald ein neuer Alarm
 * eintrifft — pusht eine high-priority Data-Message an alle
 * registrierten HotDoc-Tablets der zugewiesenen Fahrzeuge. Damit
 * waecken auch geschlossene Apps auf und zeigen die Notification.
 *
 * Implementierungs-Modus:
 *   - Wenn FCM_SERVICE_ACCOUNT_JSON in env gesetzt: echte HTTP-Calls
 *     an https://fcm.googleapis.com/v1/projects/{project}/messages:send
 *     mit OAuth2-Bearer-Token (Service-Account-JWT).
 *   - Wenn nicht: logged nur und tut nichts. Damit kann die App
 *     entwickelt werden ohne FCM-Account.
 *
 * Doku: https://firebase.google.com/docs/cloud-messaging/migrate-v1
 *
 * Hinweis: Wir verwenden bewusst keine google-auth-library, weil das
 * Auth-Flow mit JWT + Token-Exchange in <50 Zeilen Node-Bordmitteln
 * machbar ist und die externe Lib ~3 MB Dependencies zieht. Der
 * Access-Token wird ~50 Minuten gecached (FCM gibt 1h aus, wir
 * lassen 10 min Sicherheit).
 */

import { createSign } from "node:crypto";
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

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri: string;
}

/**
 * Parst die Service-Account-JSON aus dem Env-String. Wirft wenn das
 * JSON kaputt ist — der Caller soll dann nur loggen, nicht crashen.
 */
function parseServiceAccount(raw: string): ServiceAccount {
  const obj = JSON.parse(raw) as Partial<ServiceAccount>;
  if (!obj.client_email || !obj.private_key || !obj.project_id) {
    throw new Error(
      "FCM_SERVICE_ACCOUNT_JSON fehlt eine der Pflicht-Felder: client_email, private_key, project_id",
    );
  }
  return {
    client_email: obj.client_email,
    private_key: obj.private_key,
    project_id: obj.project_id,
    token_uri: obj.token_uri ?? "https://oauth2.googleapis.com/token",
  };
}

/** Base64-URL-Encoding (RFC 7515 §2). */
function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Baut + signiert ein Google-OAuth2-JWT (Service-Account-Self-Signed)
 * und tauscht es bei Googles Token-Endpoint gegen einen access_token,
 * der gegen die FCM-v1-API genutzt werden kann.
 */
async function fetchAccessToken(sa: ServiceAccount): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(sa.private_key));
  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OAuth2-Token-Exchange fehlgeschlagen: ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("OAuth2-Antwort ohne access_token");
  }
  return {
    token: json.access_token,
    // 10 Minuten Sicherheits-Puffer vor dem echten expiry
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 - 10 * 60 * 1000,
  };
}

/** In-Memory-Cache fuer den Access-Token. */
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  tokenCache = await fetchAccessToken(sa);
  return tokenCache.token;
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
  const devices = await listTokensFor(fahrzeugIds);
  if (devices.length === 0) {
    logger.info({ fahrzeugIds }, "FCM-Push: keine registrierten Devices");
    return { versendet: 0, fehlgeschlagen: 0, uebersprungen: 0 };
  }

  if (!env.FCM_SERVICE_ACCOUNT_JSON) {
    if (env.FCM_SERVER_KEY) {
      logger.warn(
        "FCM_SERVER_KEY ist gesetzt aber wird ignoriert — Legacy-API ist seit 2024-06-20 abgeschaltet. Bitte FCM_SERVICE_ACCOUNT_JSON setzen (HTTP v1).",
      );
    }
    logger.warn(
      { devices: devices.length, fahrzeugIds, payload },
      "FCM-Push: FCM_SERVICE_ACCOUNT_JSON nicht gesetzt — nur Mock-Log, kein echter Push",
    );
    return { versendet: 0, fehlgeschlagen: 0, uebersprungen: devices.length };
  }

  let sa: ServiceAccount;
  let accessToken: string;
  try {
    sa = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
    accessToken = await getAccessToken(sa);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "FCM-Push: OAuth2-Auth fehlgeschlagen",
    );
    return { versendet: 0, fehlgeschlagen: devices.length, uebersprungen: 0 };
  }

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let ok = 0;
  let fail = 0;
  for (const device of devices) {
    try {
      // FCM v1 Format — message.token (single recipient), v1-Schema fuer
      // Android-Priority + TTL.
      const body = {
        message: {
          token: device.fcmToken,
          ...(payload.notification ? { notification: payload.notification } : {}),
          data: payload.data,
          android: {
            priority: "HIGH" as const,
            ttl: "60s",
          },
        },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        // 401 -> Token abgelaufen; cachen wir den naechsten Call neu
        if (res.status === 401) {
          tokenCache = null;
        }
        // 404 / UNREGISTERED -> Token ungueltig, Device wegputzen
        if (res.status === 404 || text.includes("UNREGISTERED")) {
          await markDeviceStale(device._id).catch(() => undefined);
        }
        logger.warn(
          { status: res.status, deviceId: device._id, body: text.slice(0, 300) },
          "FCM-Push fehlgeschlagen",
        );
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

/**
 * Setzt ein Feld stale=true am Device-Doc — der Eintrag bleibt sichtbar
 * im Backoffice (mit Warnung), wird aber bei zukuenftigen Pushes
 * uebersprungen. Wenn das Doc nicht (mehr) existiert, ignorieren wir es.
 */
async function markDeviceStale(deviceId: string): Promise<void> {
  try {
    const doc = (await db.get(deviceId)) as DeviceDoc & {
      stale?: boolean;
      staleAt?: string;
    };
    if (doc.stale) return;
    await db.insert({
      ...doc,
      stale: true,
      staleAt: new Date().toISOString(),
    });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return;
    throw err;
  }
}
