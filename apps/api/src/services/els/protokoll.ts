/**
 * Statusfunk ins Einsatzprotokoll: JEDE Aenderung des Funkstatus eines unserer
 * Fahrzeuge (ausgerueckt, am Einsatzort, Sprechwunsch, eingerueckt, ...) wird
 * mit dem Zeitpunkt der Statusmeldung als Chronik-Eintrag am Einsatz festgehalten:
 *
 *   14:32  Tank Eberstalzell: Funkstatus 4: Am Einsatzort eingetroffen
 *
 * Zuordnung zum Einsatz:
 *  - meldet die Einheit eine ELS-Einsatznummer (`num_1`) und ein aktiver HotDoc-
 *    Einsatz traegt `els-<num_1>` in alarmIds -> dieser Einsatz;
 *  - ohne Einsatznummer (z. B. "eingerueckt" nach Einsatzende, Sprechwunsch)
 *    -> der Einsatz, an dem das Fahrzeug zuletzt per ELS beteiligt war (max. 12 h,
 *    solange aktiv). Mit "eingerueckt" (Status 2) ist das Fahrzeug fertig, die
 *    Merkung endet danach.
 * Statuswechsel ohne Einsatz (Wache, Uebung der Leitstelle ...) landen nirgends.
 *
 * Idempotent: Eintrags-ID = Fahrzeug + Status + Meldezeit; ein Neustart oder
 * ein zweiter Poll schreibt nichts doppelt. Da die Positionsabfrage nur alle
 * 60 s moeglich ist, kann ein Status, der innerhalb einer Minute wieder
 * wechselt, fehlen (die Schnittstelle liefert keine Statushistorie).
 */

import { FAHRZEUGE, funkstatusChronikText, type FahrzeugId } from "@hotdoc/shared";
import { db } from "../../couch/client.js";
import { logger } from "../../lib/logger.js";
import { elsAlarmId, type FahrzeugFunkstatus } from "./logik.js";
import { merkeVerlauf } from "./verlauf.js";

/** So lange bleibt ein Fahrzeug einem Einsatz zugeordnet, auch ohne ELS-Einsatznummer. */
const MERKUNG_MS = 12 * 60 * 60 * 1000;
/** Statuswechsel, die deutlich VOR der Alarmierung des Einsatzes liegen, gehoeren nicht dazu. */
const VOR_ALARM_TOLERANZ_MS = 10 * 60 * 1000;
/** "Eingerueckt (einsatzbereit auf Wache)" beendet die Beteiligung des Fahrzeugs. */
const STATUS_EINGERUECKT = "2";

interface Merkung {
  einsatzId: string;
  bis: number;
}

const letzterStand = new Map<FahrzeugId, string>();
const merkungen = new Map<FahrzeugId, Merkung>();

/** Nur fuer Tests. */
export function resetProtokollState(): void {
  letzterStand.clear();
  merkungen.clear();
  letzteEntscheidung.clear();
}

interface EinsatzMin {
  _id: string;
  status?: string;
  schreibschutz?: boolean;
  alarmId?: string;
  alarmIds?: string[];
  alarmierungZeit?: string;
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

async function ladeAktive(): Promise<EinsatzMin[]> {
  const r = await db.find({
    selector: { type: "einsatz", status: "aktiv" },
    fields: ["_id", "status", "schreibschutz", "alarmId", "alarmIds", "alarmierungZeit"],
    limit: 200,
  });
  return r.docs as EinsatzMin[];
}

function eintragsId(fz: FahrzeugId, status: string, tsMs: number): string {
  return `els-st-${fz}-${status}-${tsMs}`;
}

/**
 * Wird nach jedem erfolgreichen Einheiten-Abruf aufgerufen. Wirft nie — ein
 * Fehler im Protokoll darf den Positions-/Statusabruf nicht stoeren.
 */
export async function dokumentiereStatus(liste: FahrzeugFunkstatus[], jetztMs: number = Date.now()): Promise<number> {
  try {
    const geaendert = liste.filter((s) => s.status && letzterStand.get(s.fahrzeugId) !== `${s.status}|${s.since ?? ""}`);
    if (geaendert.length === 0) return 0;

    const aktive = await ladeAktive();
    let geschrieben = 0;
    for (const s of geaendert) {
      const key = `${s.status}|${s.since ?? ""}`;
      const einsatz = findeEinsatz(s, aktive, jetztMs);
      if (!einsatz) {
        verlaufEntscheidung(s, key, s.num1 ? "wartet-auf-einsatz" : "kein-einsatz");
        // Meldet die Einheit eine ELS-Einsatznummer, zu der es noch keinen HotDoc-
        // Einsatz gibt (wird in den naechsten Sekunden verknuepft/angelegt), den
        // Stand NICHT merken: der naechste Poll holt den Eintrag nach. Ohne
        // Einsatznummer gibt es nichts nachzuholen.
        if (!s.num1) letzterStand.set(s.fahrzeugId, key);
        continue;
      }
      const tsMs = Date.parse(s.since ?? "");
      const zeitMs = Number.isNaN(tsMs) ? jetztMs : tsMs;
      const alarmMs = Date.parse(einsatz.alarmierungZeit ?? "");
      if (!Number.isNaN(alarmMs) && zeitMs < alarmMs - VOR_ALARM_TOLERANZ_MS) {
        verlaufEntscheidung(s, key, "vor-alarmierung", einsatz._id);
        letzterStand.set(s.fahrzeugId, key);
        continue;
      }
      try {
        const neu = await haengeAn(einsatz._id, s, zeitMs);
        verlaufEntscheidung(s, key, neu ? "geschrieben" : "nicht-geschrieben (bereits vorhanden / Einsatz geschlossen)", einsatz._id);
        if (neu) geschrieben += 1;
        letzterStand.set(s.fahrzeugId, key);
        if (s.status === STATUS_EINGERUECKT) merkungen.delete(s.fahrzeugId);
      } catch (err) {
        // Stand NICHT merken -> naechster Poll versucht es erneut.
        verlaufEntscheidung(s, key, `fehler: ${err instanceof Error ? err.message : String(err)}`, einsatz._id);
        logger.warn(
          { fahrzeugId: s.fahrzeugId, err: err instanceof Error ? err.message : String(err) },
          "Funkstatus konnte nicht ins Protokoll geschrieben werden",
        );
      }
    }
    return geschrieben;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Funkstatus-Protokoll uebersprungen");
    return 0;
  }
}

const letzteEntscheidung = new Map<string, string>();

/** Haelt im ELS-Verlauf fest, was mit einem Funkstatus passiert ist (je Fahrzeug/Status/Ergebnis nur einmal). */
function verlaufEntscheidung(s: FahrzeugFunkstatus, key: string, ergebnis: string, einsatzId?: string): void {
  const marke = `${key}|${ergebnis}`;
  if (letzteEntscheidung.get(s.fahrzeugId) === marke) return;
  letzteEntscheidung.set(s.fahrzeugId, marke);
  merkeVerlauf("protokoll", {
    fahrzeugId: s.fahrzeugId,
    status: s.status,
    since: s.since ?? null,
    num1: s.num1,
    ergebnis,
    ...(einsatzId ? { einsatzId } : {}),
  });
}

function findeEinsatz(s: FahrzeugFunkstatus, aktive: EinsatzMin[], jetztMs: number): EinsatzMin | undefined {
  if (s.num1) {
    const id = elsAlarmId(s.num1);
    const doc = aktive.find((d) => d.alarmId === id || (d.alarmIds ?? []).includes(id));
    if (doc) {
      merkungen.set(s.fahrzeugId, { einsatzId: doc._id, bis: jetztMs + MERKUNG_MS });
      return doc;
    }
    // Einsatznummer bekannt, aber (noch) kein HotDoc-Einsatz dazu -> abwarten.
    return undefined;
  }
  const m = merkungen.get(s.fahrzeugId);
  if (!m || m.bis < jetztMs) return undefined;
  return aktive.find((d) => d._id === m.einsatzId);
}

/** Haengt den Eintrag an (dedupliziert ueber die ID). true = neu geschrieben. */
async function haengeAn(einsatzId: string, s: FahrzeugFunkstatus, zeitMs: number): Promise<boolean> {
  const id = eintragsId(s.fahrzeugId, s.status, zeitMs);
  for (let versuch = 1; versuch <= 2; versuch++) {
    const doc = (await db.get(einsatzId)) as Record<string, unknown>;
    if (doc.schreibschutz === true || doc.status !== "aktiv") return false;
    const chronik = Array.isArray(doc.chronik) ? (doc.chronik as Array<{ id?: string }>) : [];
    if (chronik.some((e) => e.id === id)) return false;
    const eintrag = {
      id,
      zeitstempel: new Date(zeitMs).toISOString(),
      funkrufname: FAHRZEUGE[s.fahrzeugId].funkrufname,
      fahrzeugId: s.fahrzeugId,
      source: "fahrzeug" as const,
      text: funkstatusChronikText(s.status),
      empfangenAm: new Date().toISOString(),
    };
    try {
      await db.insert({ ...doc, chronik: [...chronik, eintrag], geaendertAm: new Date().toISOString() });
      logger.info({ einsatzId, fahrzeugId: s.fahrzeugId, status: s.status }, "Funkstatus ins Einsatzprotokoll geschrieben");
      return true;
    } catch (err) {
      if (statusCode(err) === 409 && versuch === 1) continue;
      throw err;
    }
  }
  return false;
}
