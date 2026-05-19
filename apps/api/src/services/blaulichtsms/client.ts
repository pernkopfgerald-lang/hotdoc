/**
 * BlaulichtSMS Alarm API v1 Adapter.
 *
 * Wenn Credentials vorhanden sind: echter HTTP-Aufruf.
 * Wenn nicht: Mock-Adapter, der einen Endpoint /api/dev/blaulichtsms/trigger
 * anbietet, mit dem ein Alarm manuell simuliert werden kann.
 *
 * Siehe BlaulichtSMS Alarm-API-Spec: docs.blaulichtsms.net
 */

import { env, hasBlaulichtSMS } from "../../config.js";
import { logger } from "../../lib/logger.js";

export interface BlaulichtAlarmData {
  customerId: string;
  alarmId: string;
  alarmDate: string; // ISO
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
}

export interface BlaulichtListResponse {
  result: "OK" | "ERROR";
  alarms?: BlaulichtAlarmData[];
}

interface ClientLogin {
  customerId: string;
  username: string;
  password: string;
}

// In-memory Mock-Storage für Dev-Triggers
const mockAlarms: BlaulichtAlarmData[] = [];

export function pushMockAlarm(a: BlaulichtAlarmData): void {
  mockAlarms.push(a);
  logger.info({ alarmId: a.alarmId, mockCount: mockAlarms.length }, "Mock-Alarm gepusht");
}

export async function listAlarms(): Promise<BlaulichtAlarmData[]> {
  if (!hasBlaulichtSMS()) {
    // Mock-Modus: konsumieren und zurücksetzen, damit Poller sie genau einmal sieht
    const out = mockAlarms.splice(0);
    return out;
  }
  const login: ClientLogin = {
    customerId: env.BLAULICHTSMS_CUSTOMER_ID!,
    username: env.BLAULICHTSMS_USER!,
    password: env.BLAULICHTSMS_PW!,
  };
  try {
    const res = await fetch(`${env.BLAULICHTSMS_BASE_URL}/api/alarm/v1/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(login),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "BlaulichtSMS /list HTTP-Fehler");
      return [];
    }
    const json = (await res.json()) as BlaulichtListResponse;
    return json.alarms ?? [];
  } catch (err) {
    logger.error({ err }, "BlaulichtSMS /list fehlgeschlagen");
    return [];
  }
}
