/**
 * BlaulichtSMS Dashboard-API v1 Adapter.
 *
 * Auth-Flow (laut dashboard_api_v1.md):
 *   POST /api/alarm/v1/dashboard/login { username, password, customerId }
 *     → { success: true, sessionId: "…" }
 *   GET  /api/alarm/v1/dashboard/{sessionId}
 *     → { customerId, customerName, integrations[], alarms[], infos[] }
 *     → bei abgelaufener Session: HTTP 401, dann Re-Login
 *
 * Fehlende Credentials = harter Fehler. Frueher gab es einen Mock-Modus
 * mit /api/dev/blaulichtsms/trigger, das wurde komplett entfernt damit
 * fehlende Credentials nicht still zu Phantom-Alarmen statt echten fuehren.
 *
 * Siehe github.com/blaulichtSMS/docs:
 * - dashboard_api_v1.md (dieser Flow, optimal für Live-Polling)
 * - alarm_api_v1.md (Range-Query mit username/password/customerIds, nicht genutzt)
 */

import { env, hasBlaulichtSMS } from "../../config.js";
import { logger } from "../../lib/logger.js";

export interface BlaulichtAlarmData {
  customerId?: string;
  alarmId: string;
  alarmDate: string;
  endDate?: string;
  authorName?: string;
  alarmText?: string;
  geolocation?: {
    address?: string;
    coordinates?: { lat: number; lng: number };
    radius?: number;
  };
  recipients?: Array<{ name: string; msisdn: string; participation?: string }>;
  audioUrl?: string;
  indexNumber?: number;
  needsAcknowledgement?: boolean;
  usersAlertedCount?: number;
}

interface LoginResponse {
  success: boolean;
  sessionId: string | null;
  error: string | null;
}

interface DashboardResponse {
  customerId?: string;
  customerName?: string;
  username?: string;
  integrations?: unknown[];
  alarms?: BlaulichtRawAlarm[];
  infos?: unknown[];
}

/**
 * Rohstruktur wie sie die BlaulichtSMS-API liefert.
 * Achtung: das echte API liefert geolocation.coordinates.lon (nicht lng).
 */
interface BlaulichtRawAlarm {
  customerId?: string;
  alarmId: string;
  alarmDate: string;
  endDate?: string;
  authorName?: string;
  alarmText?: string;
  needsAcknowledgement?: boolean;
  usersAlertedCount?: number;
  indexNumber?: number;
  audioUrl?: string | null;
  geolocation?: {
    coordinates?: { lat: number; lon?: number; lng?: number };
    address?: string;
    radius?: number | null;
    distance?: number | null;
    positionSetByAuthor?: boolean;
  };
  recipients?: Array<{ name: string; msisdn: string; participation?: string }>;
  alarmGroups?: unknown[];
}

// ─── Session-State (in-memory) ──────────────────────────────────────
let sessionId: string | null = null;
let sessionLoginAt: number = 0;
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 h, danach erzwungener Re-Login

/**
 * Login durchführen + sessionId zwischenspeichern. Wirft bei Fehler.
 */
async function login(): Promise<string> {
  const body = {
    username: env.BLAULICHTSMS_USER!,
    password: env.BLAULICHTSMS_PW!,
    customerId: env.BLAULICHTSMS_CUSTOMER_ID!,
  };
  const res = await fetch(`${env.BLAULICHTSMS_BASE_URL}/api/alarm/v1/dashboard/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`BlaulichtSMS-Login HTTP ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as LoginResponse;
  if (!json.success || !json.sessionId) {
    throw new Error(`BlaulichtSMS-Login fehlgeschlagen: ${json.error ?? "unbekannt"}`);
  }
  sessionId = json.sessionId;
  sessionLoginAt = Date.now();
  logger.info(
    { sessionIdPrefix: json.sessionId.slice(0, 8) + "…", customerId: env.BLAULICHTSMS_CUSTOMER_ID },
    "BlaulichtSMS-Login erfolgreich",
  );
  return json.sessionId;
}

/**
 * Holt aktuelle Alarme. Macht bei Bedarf einen Login (initial oder nach 401).
 */
async function fetchDashboard(): Promise<DashboardResponse> {
  if (!sessionId || Date.now() - sessionLoginAt > SESSION_MAX_AGE_MS) {
    await login();
  }
  const res = await fetch(
    `${env.BLAULICHTSMS_BASE_URL}/api/alarm/v1/dashboard/${sessionId}`,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (res.status === 401) {
    // Session abgelaufen — einmaliger Re-Login + Retry
    logger.info("BlaulichtSMS-Session abgelaufen, re-login");
    sessionId = null;
    await login();
    const r2 = await fetch(
      `${env.BLAULICHTSMS_BASE_URL}/api/alarm/v1/dashboard/${sessionId}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!r2.ok) {
      throw new Error(`BlaulichtSMS-Dashboard HTTP ${r2.status} (nach Re-Login)`);
    }
    return (await r2.json()) as DashboardResponse;
  }
  if (!res.ok) {
    throw new Error(`BlaulichtSMS-Dashboard HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as DashboardResponse;
}

/**
 * Normalisiert die Roh-API-Antwort auf unser internes Format.
 * - geolocation.coordinates.lon → .lng (Konsistenz mit MapCard)
 */
function normalize(raw: BlaulichtRawAlarm): BlaulichtAlarmData {
  const coords = raw.geolocation?.coordinates;
  return {
    alarmId: raw.alarmId,
    alarmDate: raw.alarmDate,
    ...(raw.customerId ? { customerId: raw.customerId } : {}),
    ...(raw.endDate ? { endDate: raw.endDate } : {}),
    ...(raw.authorName ? { authorName: raw.authorName } : {}),
    ...(raw.alarmText ? { alarmText: raw.alarmText } : {}),
    ...(raw.audioUrl ? { audioUrl: raw.audioUrl } : {}),
    ...(raw.indexNumber != null ? { indexNumber: raw.indexNumber } : {}),
    ...(raw.needsAcknowledgement != null
      ? { needsAcknowledgement: raw.needsAcknowledgement }
      : {}),
    ...(raw.usersAlertedCount != null ? { usersAlertedCount: raw.usersAlertedCount } : {}),
    ...(raw.recipients ? { recipients: raw.recipients } : {}),
    ...(raw.geolocation
      ? {
          geolocation: {
            ...(raw.geolocation.address ? { address: raw.geolocation.address } : {}),
            ...(raw.geolocation.radius != null ? { radius: raw.geolocation.radius } : {}),
            ...(coords && typeof coords.lat === "number"
              ? {
                  coordinates: {
                    lat: coords.lat,
                    lng:
                      typeof coords.lng === "number"
                        ? coords.lng
                        : typeof coords.lon === "number"
                          ? coords.lon
                          : 0,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * Public API fuer den Poller. Wenn keine Credentials gesetzt sind, liefert
 * die Funktion eine leere Liste (kein Crash) — der Poller protokolliert die
 * fehlende Konfiguration einmalig laut beim Start. Frueher gab es hier
 * einen Mock-Modus mit In-Memory-Queue, das wurde entfernt.
 */
export async function listAlarms(): Promise<BlaulichtAlarmData[]> {
  if (!hasBlaulichtSMS()) {
    return [];
  }
  const dashboard = await fetchDashboard();
  const raws = dashboard.alarms ?? [];
  return raws.map(normalize);
}

/**
 * Test-Probe für /api/dev/sybos-probe-artiges Setup-Verifying.
 * Liefert die Roh-Antwort von Login + erstem Dashboard-Call zurück.
 */
export async function probeBlaulichtSms(): Promise<{
  ok: boolean;
  loginOk: boolean;
  sessionIdPrefix?: string;
  alarmsCount?: number;
  rawDashboardSample?: unknown;
  error?: string;
}> {
  if (!hasBlaulichtSMS()) {
    return {
      ok: false,
      loginOk: false,
      error: "BlaulichtSMS-Credentials nicht gesetzt (BLAULICHTSMS_USER/PW/CUSTOMER_ID)",
    };
  }
  try {
    const sid = await login();
    const dashboard = await fetchDashboard();
    return {
      ok: true,
      loginOk: true,
      sessionIdPrefix: sid.slice(0, 8) + "…",
      alarmsCount: dashboard.alarms?.length ?? 0,
      rawDashboardSample: {
        customerId: dashboard.customerId,
        customerName: dashboard.customerName,
        username: dashboard.username,
        alarmsPreview: (dashboard.alarms ?? []).slice(0, 1),
      },
    };
  } catch (err) {
    return {
      ok: false,
      loginOk: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
