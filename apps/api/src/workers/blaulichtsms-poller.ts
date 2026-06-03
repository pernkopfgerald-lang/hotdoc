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
import {
  FLORIAN_POSITION,
  MAX_EINSATZORT_KM,
  findAutobahnKm,
  haversineKm,
} from "@hotdoc/shared";
import { env } from "../config.js";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import { isInEberstalzell } from "../routes/geocoding.js";
import { listAlarms, type BlaulichtAlarmData } from "../services/blaulichtsms/client.js";
import { pushAlarm } from "../services/fcm.js";
import { recordBlaulichtSmsPoll } from "../services/state.js";

// RISIKO-1 (Audit 2026-06-03): Defensive UTC-Normalisierung fuer Zeitstempel
// aus BlaulichtSMS. Bei TZ=Europe/Vienna kann alarmDate einen Sommerzeit-
// Offset (+02:00) tragen. Wir normalisieren neue Alarme hier auf sauberes
// UTC-"Z", damit das Einsatz-Doc immer einen einheitlichen Zeitstempel haelt
// (das Schema akzeptiert seit RISIKO-1 zwar auch Offsets, aber an der Quelle
// vereinheitlichen ist robuster). Bei nicht-parsbarem Input bleibt der
// Original-String erhalten — kein Datenverlust.
function normalizeToIso(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

let timer: ReturnType<typeof setInterval> | null = null;
// F-39: Heartbeat-Zaehler — bei leeren Polls schreiben wir einen debug-Log
// damit man im Dev-Modus den Live-Tick sieht. In production (level=info)
// werden debug-Logs unterdrueckt, also kein Spam.
let pollCount = 0;

export async function pollOnce(): Promise<{ neu: number; gesamt: number }> {
  try {
    pollCount += 1;
    const alarms = await listAlarms();
    let neu = 0;
    for (const a of alarms) {
      const created = await upsertEinsatz(a);
      if (created) neu += 1;
    }
    if (alarms.length > 0) {
      logger.info({ neu, gesamt: alarms.length }, "BlaulichtSMS-Poll fertig");
    } else {
      // F-39: Heartbeat fuer leere Polls. Im Production-Logging (info+)
      // unsichtbar, im Dev-Modus (debug) Live-Tick sichtbar.
      logger.debug({ pollCount }, "BlaulichtSMS-Poll leer");
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

/**
 * Issue 19 (Einsatz-Test 2026-06-02): Erkennt Autobahn-km-Angaben im
 * Alarmtext. Wenn der Disponent z. B. "A1 FR Salzburg bei km 201"
 * schreibt, lesen wir Autobahn + Fahrtrichtung + km heraus und schlagen
 * sie in der OSM-km-Tabelle nach.
 *
 * Akzeptierte Muster (alle case-insensitive):
 *   "A1 FR Salzburg bei km 201"
 *   "A1 Fahrtr. Wien Km 195"
 *   "A 8 Richtung Suben km 12"
 *   "A25 km 8 in Richtung Linz"   (km vor Richtung)
 *   "A1 Richtung Wien km 195 — PKW-Brand"
 *
 * Liefert null wenn kein Muster matcht oder die Komponenten ungueltig sind.
 */
export function parseAutobahnPattern(
  text: string,
): { autobahn: string; fahrtrichtung: string; km: number } | null {
  if (!text) return null;
  // RISIKO-5 (Audit 2026-06-03): Die beiden Regex unten sind durch ihre
  // backtracking-faehigen .*?-Gruppen effektiv O(n²). Ein pathologischer
  // 88KB-Alarmtext blockiert den Event-Loop ~3,8s. Reale Alarmtexte sind
  // <500 Zeichen — wir kappen den Input an der Quelle auf 1000 Zeichen
  // (Laufzeit dann <2ms), damit der Schutz greift egal welcher Aufrufer den
  // Parser nutzt.
  text = text.slice(0, 1000);
  // Pattern A: "A1 (FR|Fahrtr.|Richtung) Salzburg ... km 201"
  // Toleriert Whitespace, "bei", Trennstriche, "in Richtung", "Fahrtr.".
  const a =
    /\bA\s*(\d+)\b[^a-z]*?(?:Fahrtr\.?|FR|Richtung|in\s+Richtung)\s+([A-Za-zäöüÄÖÜß]+)\b.*?\b(?:Km|km|KM)\s*(\d+)/i.exec(
      text,
    );
  if (a && a[1] && a[2] && a[3]) {
    return { autobahn: `A${a[1]}`, fahrtrichtung: a[2], km: parseInt(a[3], 10) };
  }
  // Pattern B: km vor der Fahrtrichtung, z. B. "A25 km 8 in Richtung Linz"
  const b =
    /\bA\s*(\d+)\b.*?\b(?:Km|km|KM)\s*(\d+)\b[^a-z]*?(?:Fahrtr\.?|FR|Richtung|in\s+Richtung)\s+([A-Za-zäöüÄÖÜß]+)\b/i.exec(
      text,
    );
  if (b && b[1] && b[2] && b[3]) {
    return { autobahn: `A${b[1]}`, fahrtrichtung: b[3], km: parseInt(b[2], 10) };
  }
  return null;
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

  // Issue 19 (Einsatz-Test 2026-06-02): Autobahn-km-Pattern hat Vorrang vor
  // dem BlaulichtSMS-Geocoder. Wenn der Alarmtext eine Autobahn-km-Angabe
  // ("A1 FR Salzburg bei km 201") enthaelt und wir den km-Wert in der
  // OSM-Lookup-Tabelle finden, ueberschreiben wir die Geocoder-Koordinaten
  // damit die Fahrzeuge die richtige Spur und den richtigen Abschnitt der
  // Autobahn anfahren. Der 40-km-Plausi-Check wird dabei uebersprungen —
  // A1 km 215 ist 25 km westlich vom FF-Haus, das ist korrekt + bekannt.
  let koordinaten: { lat: number; lng: number } | null =
    a.geolocation?.coordinates ?? null;
  let einsatzortText = a.geolocation?.address ?? a.alarmText ?? "Unbekannt";
  let adresseAutoSkippedReason: string | undefined;
  let autobahnPatternMatched = false;

  const autobahnHit = parseAutobahnPattern(a.alarmText ?? "");
  if (autobahnHit) {
    const koords = findAutobahnKm(
      autobahnHit.autobahn,
      autobahnHit.fahrtrichtung,
      autobahnHit.km,
    );
    if (koords) {
      koordinaten = koords;
      einsatzortText = `${autobahnHit.autobahn} FR ${autobahnHit.fahrtrichtung}, km ${autobahnHit.km}`;
      autobahnPatternMatched = true;
      logger.info(
        {
          alarmId: a.alarmId,
          autobahn: autobahnHit.autobahn,
          fahrtrichtung: autobahnHit.fahrtrichtung,
          km: autobahnHit.km,
          koords,
        },
        "Autobahn-km-Pattern erkannt → Geocoder-Koords ueberschrieben",
      );
    } else {
      logger.warn(
        { alarmId: a.alarmId, autobahnHit },
        "Autobahn-Pattern erkannt, aber km nicht in Lookup-Tabelle",
      );
    }
  }

  // Issue 7 (Einsatz-Test 2026-06-02): Plausibilitaets-Check fuer Geocoder.
  // Wenn der BlaulichtSMS-Geocoder eine Adresse > 40 km vom FF-Haus liefert,
  // ist das fast immer ein Fehl-Hit (z. B. "B1" → Berlin statt B1-Autobahn,
  // oder generisches Ortsschlagwort das mehrfach in OE existiert). Wir
  // setzen den einsatzort dann auf "" damit die Mannschaft am Tablet die
  // richtige Adresse eintragen muss — besser leer als 90 km in die falsche
  // Richtung fahren. Marker `adresseAutoSkippedReason` bleibt im Doc damit
  // wir die Quote der falschen Geocodes auswerten koennen.
  //
  // Issue 19 (Einsatz-Test 2026-06-02): wenn die Koords aus dem Autobahn-
  // Lookup stammen, ist der 40-km-Check obsolet — uebersprungen.
  if (!autobahnPatternMatched && a.geolocation?.coordinates) {
    const distKm = haversineKm(FLORIAN_POSITION, a.geolocation.coordinates);
    if (distKm > MAX_EINSATZORT_KM) {
      adresseAutoSkippedReason = `geocoder_off_${Math.round(distKm)}km`;
      einsatzortText = "";
      koordinaten = null;
      logger.warn(
        {
          alarmId: a.alarmId,
          distKm: Math.round(distKm),
          rejected: a.geolocation.address,
        },
        "BlaulichtSMS-Geocoder > 40 km vom FF-Haus → einsatzort geleert",
      );
    }
  }

  const doc = {
    _id: id,
    type: "einsatz" as const,
    einsatzTyp: "alarm" as const,
    alarmId: a.alarmId,
    einsatzort: einsatzortText,
    ...(adresseAutoSkippedReason ? { adresseAutoSkippedReason } : {}),
    // Issue 19 (Einsatz-Test 2026-06-02): Audit-Marker fuer ausgewertete
    // Autobahn-Lookup-Treffer. Backoffice kann darueber die Quote der
    // Pattern-Erkennung auswerten.
    ...(autobahnPatternMatched ? { autobahnPatternMatched: true } : {}),
    ...(koordinaten
      ? {
          koordinaten: {
            lat: koordinaten.lat,
            lng: koordinaten.lng,
          },
          // Auto-Pflichtbereich: BlaulichtSMS-Alarme mit GPS in der
          // Eberstalzell-Gemeinde-Bbox setzen pflichtbereich + Einsatzzone
          // automatisch — der Florian-Editor zeigt die Checkboxen
          // schon angekreuzt, der EL kann sie bei Bedarf umstellen.
          ...(isInEberstalzell(koordinaten.lat, koordinaten.lng)
            ? { pflichtbereich: true, einsatzzoneEzell: true }
            : {}),
        }
      : {}),
    // RISIKO-1 (Audit 2026-06-03): roh a.alarmDate kann +02:00-Offset tragen
    // (TZ=Europe/Vienna, Sommerzeit) → auf UTC-"Z" normalisieren.
    alarmierungZeit: normalizeToIso(a.alarmDate),
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
