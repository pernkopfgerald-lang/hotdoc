/**
 * BlaulichtSMS-Poller — wird alle BLAULICHTSMS_POLL_INTERVAL_SEC Sekunden
 * aufgerufen. Neue Alarme werden als Einsatz-Dokument in CouchDB angelegt
 * (falls noch nicht vorhanden, idempotent ueber alarmId).
 *
 * Wenn keine BlaulichtSMS-Credentials gesetzt sind, liefert listAlarms()
 * eine leere Liste und der Poller protokolliert das einmalig beim Start.
 * Mock-Modus wurde entfernt — Test-Einsätze laufen ueber den normalen
 * "Neuer Einsatz → Uebung"-Flow im Backoffice/PWA.
 *
 * Audit R3:
 *  - I-01: Sofort-Poll beim Start, noch vor dem ersten setInterval-Tick —
 *    nach einem Deploy/Neustart vergehen sonst erst POLL_INTERVAL Sekunden,
 *    in denen ein Alarm unbemerkt bliebe. Kostenneutral (ein Request mehr
 *    pro Prozessstart).
 *  - N-11/I-12: inFlight-Guard (kein zweiter Poll, solange einer laeuft);
 *    409 beim Insert = Race mit einem parallelen Schreiber -> kein Fehler,
 *    die Schleife verarbeitet die restlichen Alarme; Fehler bei EINEM Alarm
 *    blockieren die anderen nicht; Chronik-Zeitstempel UTC-normalisiert.
 *  - S-09/N-10: Doppelalarm-/Nachalarmierungs-Erkennung — siehe
 *    findeDoppelalarmKandidat(). Das neue Einsatz-Doc wird trotzdem angelegt
 *    (mit `moeglichesDuplikatVon`), der aeltere Einsatz bekommt die neue
 *    alarmId in `alarmIds` plus einen Chronik-Eintrag; es geht genau EIN
 *    FCM-Push mit Hinweis raus.
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

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Doppelalarm-Erkennung (S-09/N-10) ───────────────────────────────
/** Zeitfenster, in dem ein aktiver Alarm-Einsatz als Kandidat gilt. */
const DOPPELALARM_FENSTER_MS = 20 * 60 * 1000;
/** Koordinaten-Naehe (Luftlinie), ab der zwei Alarme als dasselbe Ereignis gelten. */
const DOPPELALARM_MAX_DIST_KM = 0.3;
/** Mango-Limit — mehr als ein paar aktive Alarm-Einsaetze gibt es nie. */
const DOPPELALARM_FIND_LIMIT = 100;

/** Nur die Felder eines Einsatz-Docs, die die Heuristik braucht. */
interface DoppelalarmKandidat {
  _id: string;
  alarmId?: string;
  alarmIds?: string[];
  alarmierungZeit?: string;
  alarmierungText?: string;
  einsatzort?: string;
  koordinaten?: { lat?: number; lng?: number };
  moeglichesDuplikatVon?: string;
}

/** Kleinschreibung, Whitespace zusammengezogen — fuer Text-/Ortsvergleiche. */
function normText(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Wie normText, aber der Fallback-Platzhalter "Unbekannt" zaehlt als leer. */
function normOrt(s: string | undefined): string {
  const n = normText(s);
  return n === "unbekannt" ? "" : n;
}

let timer: ReturnType<typeof setInterval> | null = null;
// F-39: Heartbeat-Zaehler — bei leeren Polls schreiben wir einen debug-Log
// damit man im Dev-Modus den Live-Tick sieht. In production (level=info)
// werden debug-Logs unterdrueckt, also kein Spam.
let pollCount = 0;
// N-11: Der gerade laufende Poll. Solange gesetzt, startet weder der
// Intervall-Tick noch der manuelle Dev-Trigger einen zweiten Poll — sonst
// verarbeiten zwei Durchlaeufe dieselben Alarme und rennen beim Insert in
// 409 bzw. schicken den FCM-Push doppelt.
let inFlight: Promise<PollErgebnis> | null = null;
// Zaehlt Intervall-Ticks, die wegen eines noch laufenden Polls ausgelassen
// wurden (in Folge). Wird nach jedem abgeschlossenen Poll zurueckgesetzt.
let ticksUebersprungenInFolge = 0;
// I-12: Ab so vielen Fehlern in Folge brechen wir die Alarm-Schleife ab —
// dann ist nicht ein einzelnes Doc kaputt, sondern CouchDB weg, und jeder
// weitere Versuch kostet nur Timeout-Zeit.
const MAX_FEHLER_IN_FOLGE = 3;

export interface PollErgebnis {
  /** Neu angelegte Einsatz-Docs in diesem Poll. */
  neu: number;
  /** Vom Dashboard gelieferte Alarme. */
  gesamt: number;
  /** Alarme, deren Verarbeitung mit einem Fehler (ausser 409) abgebrochen wurde. */
  fehler: number;
}

/**
 * Ein Poll-Durchlauf. Laeuft bereits einer, haengt sich der Aufrufer an
 * dessen Promise (N-11) — es gibt nie zwei parallele Durchlaeufe.
 */
export function pollOnce(): Promise<PollErgebnis> {
  if (inFlight) return inFlight;
  inFlight = pollOnceIntern().finally(() => {
    inFlight = null;
    ticksUebersprungenInFolge = 0;
  });
  return inFlight;
}

async function pollOnceIntern(): Promise<PollErgebnis> {
  pollCount += 1;
  let alarms: BlaulichtAlarmData[];
  try {
    alarms = await listAlarms();
  } catch (err) {
    recordBlaulichtSmsPoll(0, errMsg(err));
    throw err;
  }

  let neu = 0;
  let fehler = 0;
  let fehlerInFolge = 0;
  let ersterFehler: string | null = null;
  for (const a of alarms) {
    try {
      const created = await upsertEinsatz(a);
      if (created) neu += 1;
      fehlerInFolge = 0;
    } catch (err) {
      // I-12: Ein einzelner kaputter Alarm (oder ein Couch-Hickser bei genau
      // diesem Doc) darf die restlichen Alarme desselben Polls nicht
      // blockieren — frueher flog hier der ganze Poll raus.
      fehler += 1;
      fehlerInFolge += 1;
      const msg = errMsg(err);
      if (!ersterFehler) ersterFehler = msg;
      logger.warn(
        { alarmId: a.alarmId, err: msg },
        "Alarm konnte nicht verarbeitet werden — weiter mit dem naechsten",
      );
      if (fehlerInFolge >= MAX_FEHLER_IN_FOLGE) {
        logger.error(
          { fehlerInFolge, verbleibend: alarms.length - fehler - neu },
          "BlaulichtSMS-Poll: zu viele Fehler in Folge — Schleife abgebrochen",
        );
        break;
      }
    }
  }

  if (fehler > 0) {
    const msg = `${fehler} von ${alarms.length} Alarmen nicht verarbeitet: ${ersterFehler ?? "unbekannt"}`;
    recordBlaulichtSmsPoll(neu, msg);
    throw new Error(msg);
  }

  if (alarms.length > 0) {
    logger.info({ neu, gesamt: alarms.length }, "BlaulichtSMS-Poll fertig");
  } else {
    // F-39: Heartbeat fuer leere Polls. Im Production-Logging (info+)
    // unsichtbar, im Dev-Modus (debug) Live-Tick sichtbar.
    logger.debug({ pollCount }, "BlaulichtSMS-Poll leer");
  }
  recordBlaulichtSmsPoll(neu);
  return { neu, gesamt: alarms.length, fehler: 0 };
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

/**
 * S-09/N-10: Sucht unter den AKTIVEN Alarm-Einsaetzen der letzten 20 min
 * (relativ zur Alarmierungszeit des neuen Alarms) einen, der wahrscheinlich
 * dasselbe Ereignis beschreibt. Kandidat ist, wer mindestens eines erfuellt:
 *   - gleicher normalisierter alarmierungText
 *   - Koordinaten < 300 m Luftlinie auseinander
 *   - identischer einsatzort (normalisiert, "Unbekannt"/leer zaehlt nicht)
 * Mehrere Treffer: Wurzel bevorzugt (Einsatz ohne eigenen Duplikat-Verweis),
 * dann der aelteste — dort arbeitet die Mannschaft bereits.
 *
 * Reine Heuristik: liefert nur einen HINWEIS fuer den Editor, es wird nichts
 * zusammengefuehrt. Schlaegt die CouchDB-Query fehl, laeuft der Alarm-Pfad
 * ohne Pruefung weiter (null) — ein Alarm darf daran nie haengen bleiben.
 */
async function findeDoppelalarmKandidat(neu: {
  alarmId: string;
  alarmierungZeit: string;
  alarmierungText: string | undefined;
  einsatzort: string;
  koordinaten: { lat: number; lng: number } | null;
}): Promise<DoppelalarmKandidat | null> {
  const tNeu = Date.parse(neu.alarmierungZeit);
  const referenz = Number.isNaN(tNeu) ? Date.now() : tNeu;
  const fensterStart = new Date(referenz - DOPPELALARM_FENSTER_MS).toISOString();

  let docs: DoppelalarmKandidat[];
  try {
    // Mango ueber den Index type-status (couch/client.ts:ensureMangoIndizes);
    // einsatzTyp + alarmierungZeit filtert Couch in-memory nach — die aktive
    // Menge ist klein. alarmierungZeit ist seit RISIKO-1 UTC-"Z", damit ist
    // der String-Vergleich $gte korrekt; Alt-Docs mit Offset werden unten
    // ueber Date.parse nochmals sauber geprueft.
    const r = await db.find({
      selector: {
        type: "einsatz",
        status: "aktiv",
        einsatzTyp: "alarm",
        alarmierungZeit: { $gte: fensterStart },
      },
      limit: DOPPELALARM_FIND_LIMIT,
    });
    docs = r.docs as DoppelalarmKandidat[];
  } catch (err) {
    logger.warn(
      { alarmId: neu.alarmId, err: errMsg(err) },
      "Doppelalarm-Pruefung uebersprungen — CouchDB-Query fehlgeschlagen",
    );
    return null;
  }

  const text = normText(neu.alarmierungText);
  const ort = normOrt(neu.einsatzort);
  const neueDocId = `einsatz:${neu.alarmId}`;

  const treffer = docs.filter((d) => {
    if (!d._id || d._id === neueDocId) return false;
    // Diese alarmId ist dort schon vermerkt (z. B. haendisch) — kein Kandidat.
    if (d.alarmId === neu.alarmId || d.alarmIds?.includes(neu.alarmId)) return false;
    const tK = Date.parse(d.alarmierungZeit ?? "");
    if (Number.isNaN(tK) || Math.abs(tK - referenz) > DOPPELALARM_FENSTER_MS) return false;

    if (text && normText(d.alarmierungText) === text) return true;
    if (
      neu.koordinaten &&
      typeof d.koordinaten?.lat === "number" &&
      typeof d.koordinaten.lng === "number" &&
      haversineKm(neu.koordinaten, { lat: d.koordinaten.lat, lng: d.koordinaten.lng }) <
        DOPPELALARM_MAX_DIST_KM
    ) {
      return true;
    }
    if (ort && normOrt(d.einsatzort) === ort) return true;
    return false;
  });
  if (treffer.length === 0) return null;

  treffer.sort((x, y) => {
    const wx = x.moeglichesDuplikatVon ? 1 : 0;
    const wy = y.moeglichesDuplikatVon ? 1 : 0;
    if (wx !== wy) return wx - wy;
    return Date.parse(x.alarmierungZeit ?? "") - Date.parse(y.alarmierungZeit ?? "");
  });
  return treffer[0] ?? null;
}

/**
 * S-09/N-10: Traegt die neue alarmId in `alarmIds` des Kandidaten ein und
 * haengt einen Chronik-Eintrag "Nachalarmierung/Doppelalarm" an. Bei 409
 * (Tablet/Florian hat gerade geschrieben) genau ein Retry mit frischem Doc.
 * Wirft bei endgueltigem Fehler — der Aufrufer loggt, das neue Einsatz-Doc
 * existiert zu dem Zeitpunkt bereits.
 *
 * Bewusst NICHT angefasst: editorGeaendertAm (S-03 — Worker sind kein
 * Editor-Schreibzugriff) und status/schreibschutz.
 */
async function vermerkeDoppelalarmImKandidat(
  kandidatId: string,
  a: BlaulichtAlarmData,
  neueEinsatzId: string,
): Promise<void> {
  const eintrag = {
    id: randomUUID(),
    zeitstempel: normalizeToIso(a.alarmDate),
    fahrzeugId: "blaulichtsms",
    typ: "auto-blaulichtsms" as const,
    transkript: `Nachalarmierung/Doppelalarm: ${a.alarmText ?? "Alarmierung"} (siehe #${neueEinsatzId})`,
    transkriptStatus: "verfuegbar" as const,
  };
  for (let versuch = 1; versuch <= 2; versuch++) {
    const doc = (await db.get(kandidatId)) as Record<string, unknown>;
    const primaer = typeof doc.alarmId === "string" ? [doc.alarmId] : [];
    const bisher = Array.isArray(doc.alarmIds)
      ? (doc.alarmIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const alarmIds = [...new Set([...primaer, ...bisher, a.alarmId])];
    const chronik = Array.isArray(doc.chronik) ? (doc.chronik as unknown[]) : [];
    const patched: Record<string, unknown> = {
      ...doc,
      alarmIds,
      chronik: [...chronik, eintrag],
      geaendertAm: new Date().toISOString(),
    };
    try {
      await db.insert(patched);
      return;
    } catch (err) {
      if (statusCode(err) === 409 && versuch === 1) continue;
      throw err;
    }
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
    if (statusCode(err) !== 404) throw err;
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

  // RISIKO-1 (Audit 2026-06-03): roh a.alarmDate kann +02:00-Offset tragen
  // (TZ=Europe/Vienna, Sommerzeit) → auf UTC-"Z" normalisieren.
  const alarmierungZeit = normalizeToIso(a.alarmDate);

  // S-09/N-10: VOR dem Insert nach einem aktiven Einsatz suchen, der
  // wahrscheinlich dasselbe Ereignis ist (Nachalarmierung, zweite Leitstelle,
  // Doppel-Versand). Ergebnis wird nur als Hinweis ins neue Doc geschrieben.
  const kandidat = await findeDoppelalarmKandidat({
    alarmId: a.alarmId,
    alarmierungZeit,
    alarmierungText: a.alarmText,
    einsatzort: einsatzortText,
    koordinaten,
  });

  const doc = {
    _id: id,
    type: "einsatz" as const,
    einsatzTyp: "alarm" as const,
    alarmId: a.alarmId,
    // V16: Gesamtliste der gemappten Alarm-IDs; alarmId bleibt die primaere.
    alarmIds: [a.alarmId],
    ...(kandidat ? { moeglichesDuplikatVon: kandidat._id } : {}),
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
    alarmierungZeit,
    ...(a.audioUrl ? { alarmierungAudio: a.audioUrl } : {}),
    ...(a.authorName ? { alarmierungAuthor: a.authorName } : {}),
    ...(a.alarmText ? { alarmierungText: a.alarmText } : {}),
    zeitmarken: {},
    beteiligteStellen: [],
    sonstigeAnwesendeFF: { aktive: [] },
    mannschaft: { bereitschaft: 0, sonstige: 0 },
    oelbindemittel: { verwendet: false, gesamtSaecke: 0 },
    meldungEinsatzleitung: "",
    reaktivierungen: [],
    schreibschutz: false,
    status: "aktiv" as const,
    fahrzeugPositionen: [],
    chronik: [
      {
        id: randomUUID(),
        // I-12: gleicher UTC-normalisierter Zeitstempel wie alarmierungZeit
        // (frueher roh a.alarmDate, ggf. mit +02:00-Offset).
        zeitstempel: alarmierungZeit,
        fahrzeugId: "blaulichtsms",
        typ: "auto-blaulichtsms" as const,
        transkript: a.alarmText ?? "Alarmierung",
        transkriptStatus: "verfuegbar" as const,
      },
    ],
    erstelltAm: now,
    geaendertAm: now,
  };
  try {
    await db.insert(doc);
  } catch (err) {
    if (statusCode(err) === 409) {
      // N-11: Das Doc ist zwischen unserem GET und dem Insert entstanden
      // (paralleler Schreiber — zweite API-Instanz beim Deploy, manueller
      // Dev-Poll). Kein Fehler: der andere hat Push + Chronik bereits
      // erledigt, wir machen mit dem naechsten Alarm weiter.
      logger.info(
        { alarmId: a.alarmId },
        "Einsatz wurde parallel bereits angelegt (409) — uebersprungen",
      );
      return false;
    }
    throw err;
  }
  logger.info(
    {
      alarmId: a.alarmId,
      einsatzort: doc.einsatzort,
      ...(kandidat ? { moeglichesDuplikatVon: kandidat._id } : {}),
    },
    kandidat
      ? "Neuer Einsatz aus Alarm angelegt — moeglicher Doppelalarm/Nachalarmierung"
      : "Neuer Einsatz aus Alarm angelegt",
  );

  // FCM-Push parallel ausfuehren — error darf den Alarm-Pfad nicht blockieren.
  // BlaulichtSMS-Alarme gehen an ALLE Tablets (leere fahrzeugIds-Liste) — der
  // jeweilige Fahrzeug-Kdt entscheidet am Tablet, ob das Fahrzeug ausrueckt.
  // S-09/N-10: Auch beim Doppelalarm geht genau EIN Push raus — fuer das neue
  // Doc, mit Hinweis auf den aelteren Einsatz. Kein zweiter Push fuer die
  // Aktualisierung des Kandidaten.
  const pushData: Record<string, string> = {
    type: "alarm",
    einsatzId: doc._id,
    alarmId: a.alarmId,
    einsatzort: doc.einsatzort,
    alarmierungZeit: doc.alarmierungZeit,
    ...(kandidat ? { moeglichesDuplikatVon: kandidat._id, hinweis: "doppelalarm" } : {}),
  };
  const pushNotification = kandidat
    ? {
        title: `Nachalarmierung: ${a.alarmText || "ALARM"}`,
        body: `${doc.einsatzort || "Einsatzort unbekannt"} · evtl. Doppelalarm zu ${kandidat.einsatzort || kandidat._id}`,
      }
    : {
        title: a.alarmText || "ALARM",
        body: doc.einsatzort,
      };
  void pushAlarm([], { notification: pushNotification, data: pushData }).catch((err) => {
    logger.warn({ err: errMsg(err) }, "FCM-Push beim Alarm fehlgeschlagen");
  });

  // S-09/N-10: Kandidat nachtragen (alarmIds + Chronik-Hinweis). Fehler hier
  // sind nicht alarm-kritisch — das neue Doc steht, der Push ist raus.
  if (kandidat) {
    try {
      await vermerkeDoppelalarmImKandidat(kandidat._id, a, doc._id);
      logger.info(
        { alarmId: a.alarmId, kandidat: kandidat._id },
        "Doppelalarm im aelteren Einsatz vermerkt (alarmIds + Chronik)",
      );
    } catch (err) {
      logger.warn(
        { alarmId: a.alarmId, kandidat: kandidat._id, err: errMsg(err) },
        "Doppelalarm konnte im aelteren Einsatz nicht vermerkt werden",
      );
    }
  }
  return true;
}

export function startBlaulichtSmsPoller(): void {
  if (timer) return;
  const ms = env.BLAULICHTSMS_POLL_INTERVAL_SEC * 1000;
  const tick = (): void => {
    if (inFlight) {
      // N-11: Vorheriger Poll laeuft noch (langsame Couch/BlaulichtSMS-
      // Antwort) — keinen zweiten starten. Erster Skip laut, danach nur
      // alle 20 Ticks, sonst Log-Spam bei einem haengenden Poll.
      ticksUebersprungenInFolge += 1;
      const ctx = { ticksUebersprungenInFolge, intervalSec: env.BLAULICHTSMS_POLL_INTERVAL_SEC };
      if (ticksUebersprungenInFolge === 1 || ticksUebersprungenInFolge % 20 === 0) {
        logger.warn(ctx, "BlaulichtSMS-Poll laeuft noch — Tick uebersprungen");
      } else {
        logger.debug(ctx, "BlaulichtSMS-Poll laeuft noch — Tick uebersprungen");
      }
      return;
    }
    void pollOnce().catch((err) => logger.error({ err }, "BlaulichtSMS-Poll-Fehler"));
  };
  // I-01: Sofort-Poll — nicht erst POLL_INTERVAL Sekunden nach dem Start
  // warten. Nach einem Deploy (fly startet die neue Maschine, die alte
  // stoppt) waere das sonst ein blindes Fenster fuer Alarme.
  tick();
  timer = setInterval(tick, ms);
  logger.info(
    { intervalSec: env.BLAULICHTSMS_POLL_INTERVAL_SEC, sofortPoll: true },
    "BlaulichtSMS-Poller gestartet",
  );
}

export function stopBlaulichtSmsPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
