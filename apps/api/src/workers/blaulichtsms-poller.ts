/**
 * BlaulichtSMS-Poller — wird alle BLAULICHTSMS_POLL_INTERVAL_SEC Sekunden
 * aufgerufen. Neue Alarme werden als Einsatz-Dokument in CouchDB angelegt
 * (falls noch nicht vorhanden, idempotent ueber alarmId).
 *
 * Wenn keine BlaulichtSMS-Credentials gesetzt sind, liefert listAlarms()
 * eine leere Liste und der Poller protokolliert das einmalig beim Start.
 * Mock-Modus wurde entfernt — Test-Einsätze laufen ueber den normalen
 * "Neuer Einsatz → Uebung"-Flow im Backoffice/PWA.
 */

import { randomUUID } from "node:crypto";
import { env } from "../config.js";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import { isInEberstalzell } from "../routes/geocoding.js";
import { listAlarms, type BlaulichtAlarmData } from "../services/blaulichtsms/client.js";
import { pushAlarm } from "../services/fcm.js";
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

/**
 * Erkennt den woechentlichen WAS-Box-Probealarm: jeden Samstag im Zeitraum
 * 11:50 - 13:15 Uhr lokaler Zeit mit Pattern "WAS-Box Probealarm fuer FF
 * Eberstalzell" im alarmText. Der wird nicht als Einsatz angelegt — er
 * dient nur zur Pruefung der Alarmgeber. Spaeter koennen wir hier den
 * Watchdog hochziehen ("FF hat samstags kein Probealarm bekommen!"). Aktuell
 * nur skippen.
 */
function istWasBoxProbealarm(a: BlaulichtAlarmData): boolean {
  const text = (a.alarmText ?? "").toLowerCase();
  const isProbe =
    text.includes("was-box probealarm") ||
    text.includes("was-box-probealarm") ||
    text.includes("probealarm") && text.includes("was-box");
  if (!isProbe) return false;
  try {
    const d = new Date(a.alarmDate);
    if (Number.isNaN(d.getTime())) return false;
    // Local time — Europe/Vienna. Node nutzt TZ env oder default UTC; auf
    // fly.io ist TZ nicht gesetzt. Wir konvertieren ueber Intl auf "Vienna".
    const fmt = new Intl.DateTimeFormat("de-AT", {
      timeZone: "Europe/Vienna",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(d);
    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    if (!/^sa/i.test(weekday)) return false;
    const totalMin = hh * 60 + mm;
    return totalMin >= 11 * 60 + 50 && totalMin <= 13 * 60 + 15;
  } catch {
    return false;
  }
}

async function upsertEinsatz(a: BlaulichtAlarmData): Promise<boolean> {
  // Filter: woechentlicher WAS-Box-Probealarm. Nur skippen, kein Einsatz-Doc
  // anlegen. Wird auch nicht in der FCM-Push-Pipeline weitergereicht.
  if (istWasBoxProbealarm(a)) {
    logger.info(
      { alarmId: a.alarmId, alarmDate: a.alarmDate },
      "WAS-Box-Probealarm erkannt — als Einsatz uebersprungen",
    );
    return false;
  }
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
          // Auto-Pflichtbereich: BlaulichtSMS-Alarme mit GPS in der
          // Eberstalzell-Gemeinde-Bbox setzen pflichtbereich + Einsatzzone
          // automatisch — der Florian-Editor zeigt die Checkboxen
          // schon angekreuzt, der EL kann sie bei Bedarf umstellen.
          ...(isInEberstalzell(
            a.geolocation.coordinates.lat,
            a.geolocation.coordinates.lng,
          )
            ? { pflichtbereich: true, einsatzzoneEzell: true }
            : {}),
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
  // FCM-Push parallel ausfuehren — error darf den Alarm-Pfad nicht blockieren.
  // BlaulichtSMS-Alarme gehen an ALLE Tablets (leere fahrzeugIds-Liste), weil
  // die Disposition erst nachtraeglich vom Einsatzleiter in der Florianstation
  // gemacht wird.
  void pushAlarm([], {
    notification: {
      title: a.alarmText || "ALARM",
      body: doc.einsatzort,
    },
    data: {
      type: "alarm",
      einsatzId: doc._id,
      alarmId: a.alarmId,
      einsatzort: doc.einsatzort,
      alarmierungZeit: doc.alarmierungZeit,
    },
  }).catch((err) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "FCM-Push beim Alarm fehlgeschlagen");
  });
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
