/**
 * BlaulichtSMS-Poller — wird alle BLAULICHTSMS_POLL_INTERVAL_SEC Sekunden
 * aufgerufen. Neue Alarme werden als Einsatz-Dokument in CouchDB angelegt
 * (falls noch nicht vorhanden, idempotent über alarmId).
 *
 * Im Mock-Modus (keine Credentials): Konsumiert /api/dev/blaulichtsms/trigger
 * Alarme aus dem In-Memory-Buffer.
 */

import { randomUUID } from "node:crypto";
import { env } from "../config.js";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import { listAlarms, type BlaulichtAlarmData } from "../services/blaulichtsms/client.js";
import { recordBlaulichtSmsPoll } from "../services/state.js";

let timer: ReturnType<typeof setInterval> | null = null;

export async function pollOnce(): Promise<{ neu: number; gesamt: number }> {
  try {
    const alarms = await listAlarms();
    let neu = 0;
    for (const a of alarms) {
      const created = await upsertEinsatz(a);
      if (created) neu += 1;
    }
    if (alarms.length > 0) {
      logger.info({ neu, gesamt: alarms.length }, "BlaulichtSMS-Poll fertig");
    }
    recordBlaulichtSmsPoll(neu);
    return { neu, gesamt: alarms.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordBlaulichtSmsPoll(0, msg);
    throw err;
  }
}

async function upsertEinsatz(a: BlaulichtAlarmData): Promise<boolean> {
  const id = `einsatz:${a.alarmId}`;
  try {
    await db.get(id);
    // Existiert — nichts tun (Audio + Felder können wir später in Update-Logik einarbeiten)
    return false;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }

  const now = new Date().toISOString();
  const doc = {
    _id: id,
    type: "einsatz" as const,
    einsatzTyp: "alarm" as const,
    alarmId: a.alarmId,
    einsatzort: a.geolocation?.address ?? a.alarmText ?? "Unbekannt",
    ...(a.geolocation?.coordinates
      ? {
          koordinaten: {
            lat: a.geolocation.coordinates.lat,
            lng: a.geolocation.coordinates.lng,
          },
        }
      : {}),
    alarmierungZeit: a.alarmDate,
    ...(a.audioUrl ? { alarmierungAudio: a.audioUrl } : {}),
    ...(a.authorName ? { alarmierungAuthor: a.authorName } : {}),
    ...(a.alarmText ? { alarmierungText: a.alarmText } : {}),
    zeitmarken: {},
    beteiligteStellen: [],
    sonstigeAnwesendeFF: { aktive: [] },
    mannschaft: { bereitschaft: 0, sonstige: 0 },
    verrechnung: { verrechenbar: false },
    oelbindemittel: { verwendet: false, gesamtSaecke: 0 },
    meldungEinsatzleitung: "",
    reaktivierungen: [],
    schreibschutz: false,
    status: "aktiv" as const,
    fahrzeugPositionen: [],
    chronik: [
      {
        id: randomUUID(),
        zeitstempel: a.alarmDate,
        fahrzeugId: "blaulichtsms",
        typ: "auto-blaulichtsms" as const,
        transkript: a.alarmText ?? "Alarmierung",
        transkriptStatus: "verfuegbar" as const,
      },
    ],
    erstelltAm: now,
    geaendertAm: now,
  };
  await db.insert(doc);
  logger.info({ alarmId: a.alarmId, einsatzort: doc.einsatzort }, "Neuer Einsatz aus Alarm angelegt");
  return true;
}

export function startBlaulichtSmsPoller(): void {
  if (timer) return;
  const ms = env.BLAULICHTSMS_POLL_INTERVAL_SEC * 1000;
  timer = setInterval(() => {
    void pollOnce().catch((err) => logger.error({ err }, "BlaulichtSMS-Poll-Fehler"));
  }, ms);
  logger.info({ intervalSec: env.BLAULICHTSMS_POLL_INTERVAL_SEC }, "BlaulichtSMS-Poller gestartet");
}

export function stopBlaulichtSmsPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
