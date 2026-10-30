/**
 * ELS-Poller (Schnittstelle des Landesfeuerwehrverbands).
 *
 *  1. Einheiten (units), alle ELS_UNITS_POLL_SEC (>= 60 s): Funkstatus +
 *     Position unserer Fahrzeuge -> Florianstation / Karte (services/els/state).
 *  2. Offene Einsaetze (events), alle ELS_EVENTS_POLL_SEC (>= 5 s):
 *     - schon an einem Einsatz vermerkt (alarmIds enthaelt "els-<num_1>") -> nichts
 *     - passt zu einem aktiven Einsatz (BlaulichtSMS war schneller) -> die
 *       ELS-Nummer dort vermerken, fehlende Koordinaten/Einsatzort ergaenzen
 *     - sonst, nach ELS_AUTOSTART_GRACE_SEC Wartezeit -> Einsatz selbst anlegen
 *       (Fallback, falls BlaulichtSMS den Alarm nicht liefert) + Push.
 *
 * Nicht uebernommen werden: Leitstellen-Uebungen, als "nicht veroeffentlichen"
 * markierte Einsaetze, bereits beendete und nie alarmierte Einsaetze. Anrufer-
 * daten (Name/Telefon) werden bewusst NICHT gespeichert.
 *
 * Die Verarbeitung ist idempotent: der Einsatz hat die feste ID
 * `einsatz:els-<num_1>`, ein paralleler Schreiber (409) ist kein Fehler.
 */

import { randomUUID } from "node:crypto";
import { leiteEinsatzartAb } from "@hotdoc/shared";
import { env, hasEls } from "../config.js";
import { db } from "../couch/client.js";
import { MANGO_INDIZES, useIndex } from "../couch/indizes.js";
import { logger } from "../lib/logger.js";
import { isInEberstalzell } from "../routes/geocoding.js";
import { pushAlarm } from "../services/fcm.js";
import { holeEventsRoh, holeUnitsRoh } from "../services/els/client.js";
import {
  elsAlarmId,
  elsEinsatzort,
  elsEventRelevant,
  elsStichwort,
  findeKandidat,
  graceAbgelaufen,
  istSchonVerknuepft,
  parseEvent,
  parseUnit,
  type EinsatzKandidat,
  type ElsEvent,
} from "../services/els/logik.js";
import { istLeader } from "../services/els/leader.js";
import { dokumentiereStatus } from "../services/els/protokoll.js";
import { schreibeVerlauf } from "../services/els/verlauf.js";
import {
  getElsSnapshot,
  recordEventsPoll,
  recordUnitsPoll,
  setElsUnits,
  zaehleAngelegt,
  zaehleVerknuepft,
} from "../services/els/state.js";
import { haengeWetterAn } from "../services/wetter.js";

/** Einsaetze, die aelter sind, werden nie mehr selbst angelegt (veraltete offene ELS-Einsaetze). */
const AUTOSTART_MAX_ALTER_MS = 6 * 60 * 60 * 1000;
/** Fenster, in dem vorhandene Einsatz-Docs zum Abgleich geladen werden. */
const ABGLEICH_FENSTER_MS = 24 * 60 * 60 * 1000;

let unitsTimer: ReturnType<typeof setInterval> | null = null;
let eventsTimer: ReturnType<typeof setInterval> | null = null;
let unitsInFlight = false;
let eventsInFlight = false;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

// ─── Einheiten ───────────────────────────────────────────────────────

export async function pollUnitsOnce(): Promise<void> {
  if (unitsInFlight) return;
  unitsInFlight = true;
  try {
    // Nur die Instanz mit der Leihe fragt ab (siehe services/els/leader.ts).
    if (!(await istLeader())) return;
    const units = (await holeUnitsRoh())
      .map(parseUnit)
      .filter((u): u is NonNullable<typeof u> => u !== null);
    await setElsUnits(units);
    recordUnitsPoll(null);
    // Statuswechsel unserer Fahrzeuge ins Einsatzprotokoll (Chronik) schreiben.
    const snap = getElsSnapshot();
    if (snap) await dokumentiereStatus(snap.status);
    // Verlauf (Rohwerte der Leitstelle + Entscheidungen) dauerhaft in der DB ablegen.
    await schreibeVerlauf();
    logger.debug({ anzahl: units.length }, "ELS-Einheiten aktualisiert");
  } catch (err) {
    recordUnitsPoll(errMsg(err));
    logger.warn({ err: errMsg(err) }, "ELS-Einheiten konnten nicht abgerufen werden");
  } finally {
    unitsInFlight = false;
  }
}

// ─── Einsaetze ───────────────────────────────────────────────────────

interface EinsatzDocMin extends EinsatzKandidat {
  einsatzTyp?: string;
}

async function ladeEinsaetze(): Promise<EinsatzDocMin[]> {
  const ab = new Date(Date.now() - ABGLEICH_FENSTER_MS).toISOString();
  const r = await db.find({
    selector: { type: "einsatz", alarmierungZeit: { $gte: ab } },
    // WARUM use_index: ohne Index liest CouchDB bei JEDEM Poll (alle 15 s) die
    // komplette DB inkl. Foto-Dokumenten. Index [type, alarmierungZeit].
    use_index: useIndex(MANGO_INDIZES.typeAlarmierungZeit),
    fields: [
      "_id",
      "status",
      "einsatzTyp",
      "alarmId",
      "alarmIds",
      "alarmierungZeit",
      "alarmierungText",
      "einsatzort",
      "koordinaten",
    ],
    limit: 200,
  });
  return r.docs as EinsatzDocMin[];
}

export async function pollEventsOnce(): Promise<void> {
  if (eventsInFlight) return;
  eventsInFlight = true;
  try {
    if (!(await istLeader())) return;
    const events = (await holeEventsRoh())
      .map(parseEvent)
      .filter((e): e is ElsEvent => e !== null)
      .filter(elsEventRelevant);
    recordEventsPoll(events.length, null);
    if (events.length === 0) return;

    const docs = await ladeEinsaetze();
    for (const e of events) {
      try {
        await verarbeiteEvent(e, docs);
      } catch (err) {
        logger.warn({ num1: e.num1, err: errMsg(err) }, "ELS-Einsatz konnte nicht verarbeitet werden");
      }
    }
  } catch (err) {
    recordEventsPoll(0, errMsg(err));
    logger.warn({ err: errMsg(err) }, "ELS-Einsaetze konnten nicht abgerufen werden");
  } finally {
    eventsInFlight = false;
  }
}

async function verarbeiteEvent(e: ElsEvent, docs: EinsatzDocMin[]): Promise<void> {
  if (istSchonVerknuepft(e, docs)) return;

  const kandidat = findeKandidat(
    e,
    docs.filter((d) => d.einsatzTyp === "alarm" || d.einsatzTyp === undefined),
  );
  if (kandidat) {
    await verknuepfe(kandidat._id, e);
    // Im lokalen Abgleich-Stand vermerken, damit der naechste Event dieses Polls
    // denselben Einsatz nicht noch einmal nimmt.
    kandidat.alarmIds = [...(kandidat.alarmIds ?? []), elsAlarmId(e.num1)];
    zaehleVerknuepft();
    return;
  }

  if (env.ELS_AUTOSTART !== "1") return;
  if (!graceAbgelaufen(e, env.ELS_AUTOSTART_GRACE_SEC)) return;
  if (Date.now() - Date.parse(e.firstDispatchTime ?? "") > AUTOSTART_MAX_ALTER_MS) return;

  const angelegt = await legeEinsatzAn(e);
  if (angelegt) {
    docs.push({
      _id: angelegt._id,
      status: "aktiv",
      einsatzTyp: "alarm",
      alarmId: elsAlarmId(e.num1),
      alarmIds: [elsAlarmId(e.num1)],
      alarmierungZeit: angelegt.alarmierungZeit,
      einsatzort: angelegt.einsatzort,
      ...(e.lat !== null && e.lng !== null ? { koordinaten: { lat: e.lat, lng: e.lng } } : {}),
    });
    zaehleAngelegt();
  }
}

/** Einsatzart-Vorschlag aus dem ELS-Stichwort (und ggf. dem schon vorhandenen Alarmtext). */
function leiteElsEinsatzartAb(e: ElsEvent, vorhandenerText: string | undefined): string | undefined {
  return leiteEinsatzartAb({
    tycod: e.tycod,
    subTycod: e.subTycod,
    typ: e.typ,
    sub: e.sub,
    alarmText: e.alarmText || vorhandenerText,
  });
}

/** ELS-Nummer an einem vorhandenen Einsatz vermerken + fehlende Stammdaten ergaenzen. */
async function verknuepfe(einsatzId: string, e: ElsEvent): Promise<void> {
  for (let versuch = 1; versuch <= 2; versuch++) {
    const doc = (await db.get(einsatzId)) as Record<string, unknown>;
    const id = elsAlarmId(e.num1);
    const primaer = typeof doc.alarmId === "string" ? [doc.alarmId] : [];
    const bisher = Array.isArray(doc.alarmIds)
      ? (doc.alarmIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (bisher.includes(id) || doc.alarmId === id) return;
    const chronik = Array.isArray(doc.chronik) ? (doc.chronik as unknown[]) : [];
    const patched: Record<string, unknown> = {
      ...doc,
      alarmIds: [...new Set([...primaer, ...bisher, id])],
      chronik: [
        ...chronik,
        {
          id: `els-${e.num1}-link`,
          zeitstempel: new Date().toISOString(),
          fahrzeugId: "blaulichtsms",
          typ: "auto-blaulichtsms",
          transkript: `ELS-Einsatz ${e.num1} zugeordnet: ${elsStichwort(e)}`,
          transkriptStatus: "verfuegbar",
        },
      ],
      geaendertAm: new Date().toISOString(),
    };
    // Nur LEERE Felder ergaenzen — Eingaben der Mannschaft/Florianstation bleiben.
    const koord = doc.koordinaten as { lat?: unknown; lng?: unknown } | undefined;
    if ((!koord || typeof koord.lat !== "number") && e.lat !== null && e.lng !== null) {
      patched.koordinaten = { lat: e.lat, lng: e.lng };
      if (isInEberstalzell(e.lat, e.lng) && doc.pflichtbereich === undefined) {
        patched.pflichtbereich = true;
        patched.einsatzzoneEzell = true;
      }
    }
    const ort = typeof doc.einsatzort === "string" ? doc.einsatzort.trim() : "";
    const elsOrt = elsEinsatzort(e);
    if ((ort === "" || ort.toLowerCase() === "unbekannt") && elsOrt) patched.einsatzort = elsOrt;
    // Einsatzart nur vorschlagen, wenn noch keine gesetzt ist (Brand wurde sonst als T26 nummeriert).
    const hatArt = typeof doc.einsatzart === "string" && doc.einsatzart.trim() !== "";
    if (!hatArt) {
      const art = leiteElsEinsatzartAb(e, typeof doc.alarmierungText === "string" ? doc.alarmierungText : undefined);
      if (art) {
        patched.einsatzart = art;
        patched.einsatzartAuto = true;
      }
    }
    try {
      await db.insert(patched);
      logger.info({ einsatzId, num1: e.num1 }, "ELS-Einsatz mit vorhandenem Einsatz verknüpft");
      return;
    } catch (err) {
      if (statusCode(err) === 409 && versuch === 1) continue;
      throw err;
    }
  }
}

/** Legt den Einsatz aus ELS selbst an (Fallback). Liefert null bei Race (409). */
async function legeEinsatzAn(e: ElsEvent): Promise<{ _id: string; alarmierungZeit: string; einsatzort: string } | null> {
  const alarmId = elsAlarmId(e.num1);
  const id = `einsatz:${alarmId}`;
  const now = new Date().toISOString();
  const alarmierungZeit = e.firstDispatchTime ?? e.createTime ?? now;
  const einsatzort = elsEinsatzort(e);
  const stichwort = elsStichwort(e);
  const text = e.alarmText && !stichwort.includes(e.alarmText) ? `${stichwort} – ${e.alarmText}` : stichwort;
  const hatPos = e.lat !== null && e.lng !== null;
  const art = leiteElsEinsatzartAb(e, undefined);

  const doc = {
    _id: id,
    type: "einsatz" as const,
    einsatzTyp: "alarm" as const,
    alarmId,
    alarmIds: [alarmId],
    ...(art ? { einsatzart: art, einsatzartAuto: true } : {}),
    einsatzort,
    ...(hatPos
      ? {
          koordinaten: { lat: e.lat as number, lng: e.lng as number },
          ...(isInEberstalzell(e.lat as number, e.lng as number)
            ? { pflichtbereich: true, einsatzzoneEzell: true }
            : {}),
        }
      : {}),
    alarmierungZeit,
    alarmierungText: text,
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
        zeitstempel: alarmierungZeit,
        fahrzeugId: "blaulichtsms",
        typ: "auto-blaulichtsms" as const,
        transkript: `ELS: ${text}`,
        transkriptStatus: "verfuegbar" as const,
      },
    ],
    erstelltAm: now,
    geaendertAm: now,
  };
  try {
    await db.insert(doc);
  } catch (err) {
    if (statusCode(err) === 409) return null; // paralleler Schreiber war schneller
    throw err;
  }
  void haengeWetterAn(doc._id, doc.alarmierungZeit);
  logger.info({ num1: e.num1, einsatzort }, "Neuer Einsatz aus ELS angelegt");
  void pushAlarm([], {
    notification: { title: stichwort || "ALARM", body: einsatzort || "Einsatzort unbekannt" },
    data: {
      type: "alarm",
      einsatzId: doc._id,
      alarmId,
      einsatzort,
      alarmierungZeit,
    },
  }).catch((err) => {
    logger.warn({ err: errMsg(err) }, "FCM-Push beim ELS-Alarm fehlgeschlagen");
  });
  return { _id: doc._id, alarmierungZeit, einsatzort };
}

// ─── Start / Stop ────────────────────────────────────────────────────

export function startElsPoller(): void {
  if (!hasEls()) {
    logger.info("ELS-Schnittstelle nicht konfiguriert (ELS_REGISTER_TOKEN/ELS_STATION_ID) — Poller aus");
    return;
  }
  if (unitsTimer || eventsTimer) return;
  void pollUnitsOnce();
  unitsTimer = setInterval(() => void pollUnitsOnce(), env.ELS_UNITS_POLL_SEC * 1000);
  // Einsaetze leicht versetzt starten: beide Abrufe brauchen denselben Token.
  setTimeout(() => {
    void pollEventsOnce();
    eventsTimer = setInterval(() => void pollEventsOnce(), env.ELS_EVENTS_POLL_SEC * 1000);
  }, 5000).unref?.();
  logger.info(
    {
      unitsSec: env.ELS_UNITS_POLL_SEC,
      eventsSec: env.ELS_EVENTS_POLL_SEC,
      autostart: env.ELS_AUTOSTART === "1",
      graceSec: env.ELS_AUTOSTART_GRACE_SEC,
    },
    "ELS-Poller gestartet",
  );
}

export function stopElsPoller(): void {
  if (unitsTimer) clearInterval(unitsTimer);
  if (eventsTimer) clearInterval(eventsTimer);
  unitsTimer = null;
  eventsTimer = null;
}
