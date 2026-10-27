/**
 * Reine Logik der ELS-Anbindung (keine Netzwerk-/DB-Zugriffe) — gut testbar.
 *
 *  - Antworten der Schnittstelle robust in Listen umwandeln (JSON-Varianten)
 *  - JWT-Ablaufzeit lesen
 *  - ELS-Einheiten (units) unseren Fahrzeugen zuordnen
 *  - ELS-Einsaetze mit bereits vorhandenen Einsaetzen abgleichen
 */

import { FAHRZEUGE, haversineKm, type FahrzeugId } from "@hotdoc/shared";

// ─── Antworten normalisieren ─────────────────────────────────────────

/**
 * Die Schnittstelle liefert JSON oder XML. Aus XML abgeleitetes JSON hat
 * Eigenheiten: ein einzelnes Element ist ein Objekt statt einer Liste, die
 * Liste kann in einem Wurzelobjekt stecken ({ units: { unit: [...] } }).
 * Wir suchen deshalb nach dem ersten Vorkommen von `key` und machen immer
 * eine Liste daraus.
 */
export function extractList(json: unknown, key: string): Record<string, unknown>[] {
  const found = findKey(json, key, 0);
  if (found === undefined || found === null) return [];
  const arr = Array.isArray(found) ? found : [found];
  return arr.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x));
}

function findKey(node: unknown, key: string, depth: number): unknown {
  if (depth > 4 || node === null || node === undefined) return undefined;
  if (Array.isArray(node)) {
    // Die Antwort selbst ist schon die Liste.
    return depth === 0 ? node : undefined;
  }
  if (typeof node !== "object") return undefined;
  const obj = node as Record<string, unknown>;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = findKey(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** `exp` (Unix-Sekunden) aus einem JWT lesen; null bei Fehler. Keine Signaturpruefung. */
export function jwtExpMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Zeitstempel der Schnittstelle ("2023-12-31 22:40:01", ohne Zeitzone) nach
 * ISO-UTC. Ohne Zeitzone nehmen wir die Ortszeit Europe/Vienna an (ELS ist
 * eine oesterreichische Leitstelle); steht schon "Z"/Offset dran, bleibt er.
 */
export function elsZeitNachIso(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s.replace(" ", "T"));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se] = m;
  // Wiener Ortszeit -> UTC: Offset aus Intl fuer genau diesen Zeitpunkt bestimmen.
  const asUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se ?? 0));
  const offsetMin = wienOffsetMin(asUtc);
  let t = asUtc - offsetMin * 60_000;
  // Rand der Zeitumstellung: Offset am berechneten Zeitpunkt erneut pruefen.
  const offset2 = wienOffsetMin(t);
  if (offset2 !== offsetMin) t = asUtc - offset2 * 60_000;
  return new Date(t).toISOString();
}

function wienOffsetMin(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const hour = get("hour") === 24 ? 0 : get("hour");
  const asLocal = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return Math.round((asLocal - utcMs) / 60_000);
}

// ─── Einheiten (units) ───────────────────────────────────────────────

export interface ElsUnit {
  unid: string;
  unidLong: string;
  callname: string;
  sybosId: string;
  sName: string;
  unityp: string;
  /** Rohwert `unit_status` (z. B. "FW"). */
  unitStatus: string;
  /** Rohwert `status_florianstation` (Funkstatus, z. B. "3"). */
  statusFlorian: string;
  lastStatusTimestamp?: string;
  eid?: number;
  num1: string;
  lat: number | null;
  lng: number | null;
  /** Alle Felder, wie sie die Schnittstelle liefert (Diagnose: welche Felder gibt es wirklich?). */
  roh: Record<string, unknown>;
}

export function parseUnit(raw: Record<string, unknown>): ElsUnit | null {
  const unid = str(raw.unid);
  const callname = str(raw.callname);
  if (!unid && !callname) return null;
  const eid = num(raw.eid);
  const ts = elsZeitNachIso(raw.lastStatusTimestamp);
  const lat = num(raw.latitude);
  const lng = num(raw.longitude);
  return {
    unid,
    unidLong: str(raw.unid_long),
    callname,
    sybosId: str(raw.sybosId),
    sName: str(raw.s_name),
    unityp: str(raw.unityp),
    unitStatus: str(raw.unit_status),
    statusFlorian: str(raw.status_florianstation),
    ...(ts ? { lastStatusTimestamp: ts } : {}),
    ...(eid !== null ? { eid } : {}),
    num1: str(raw.num_1),
    roh: raw,
    // 0/0 heisst bei GPS-Feeds "keine Position".
    lat: lat !== null && lng !== null && !(lat === 0 && lng === 0) ? lat : null,
    lng: lat !== null && lng !== null && !(lat === 0 && lng === 0) ? lng : null,
  };
}

/** Kleinschreibung, nur Buchstaben/Ziffern — fuer tolerante Namensvergleiche. */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Manuelle Zuordnung aus config:els-zuordnung: Fahrzeug-ID -> unid oder callname. */
export type ElsZuordnungOverride = Partial<Record<FahrzeugId, string>>;

const ZUORDENBAR: ReadonlyArray<FahrzeugId> = ["kdo", "tlf-a-4000", "lfa-b", "mtf"];

/**
 * Welchem unserer Fahrzeuge gehoert die ELS-Einheit? Reihenfolge:
 *  1. manuelle Zuordnung (unid oder callname, exakt bzw. normalisiert)
 *  2. syBOS-ID des Fahrzeugs (falls im Backoffice gepflegt) == sybosId der Einheit
 *  3. callname == Kuerzel (abk) oder Funkrufname oder Bezeichnung
 * Keine Treffer -> null (taucht in der Diagnose als "nicht zugeordnet" auf).
 */
export function ordneUnitZu(
  unit: ElsUnit,
  override: ElsZuordnungOverride = {},
  syBosIds: Partial<Record<FahrzeugId, string>> = {},
): FahrzeugId | null {
  for (const id of ZUORDENBAR) {
    const o = override[id];
    if (!o) continue;
    if (o === unit.unid || normName(o) === normName(unit.callname) || normName(o) === normName(unit.unid)) return id;
  }
  if (unit.sybosId) {
    for (const id of ZUORDENBAR) {
      const s = syBosIds[id];
      if (s && s === unit.sybosId) return id;
    }
  }
  const namen = [unit.callname, unit.sName].map(normName).filter(Boolean);
  if (namen.length === 0) return null;
  for (const id of ZUORDENBAR) {
    const f = FAHRZEUGE[id];
    const kandidaten = [f.abk, f.funkrufname, f.bezeichnung].map(normName);
    if (namen.some((n) => kandidaten.includes(n))) return id;
  }
  // Die Leitstelle fuehrt oft nur den ersten Teil des Funkrufnamens ("Kommando"
  // statt "Kommando Eberstalzell", "Tank" statt "Tank Eberstalzell").
  for (const id of ZUORDENBAR) {
    const voll = normName(FAHRZEUGE[id].funkrufname);
    if (namen.some((n) => n.length >= 3 && voll.startsWith(n))) return id;
  }
  return null;
}

export interface FahrzeugFunkstatus {
  fahrzeugId: FahrzeugId;
  callname: string;
  /** Rohwert Funkstatus (status_florianstation). */
  status: string;
  unitStatus: string;
  since?: string;
  lat: number | null;
  lng: number | null;
  eid?: number;
  num1: string;
}

/** Einheiten -> Status je Fahrzeug. Bei mehreren Einheiten gewinnt die mit juengstem Status. */
export function baueFahrzeugStatus(
  units: ElsUnit[],
  override: ElsZuordnungOverride = {},
  syBosIds: Partial<Record<FahrzeugId, string>> = {},
): FahrzeugFunkstatus[] {
  const best = new Map<FahrzeugId, FahrzeugFunkstatus>();
  for (const u of units) {
    const id = ordneUnitZu(u, override, syBosIds);
    if (!id) continue;
    const neu: FahrzeugFunkstatus = {
      fahrzeugId: id,
      callname: u.callname,
      status: u.statusFlorian,
      unitStatus: u.unitStatus,
      ...(u.lastStatusTimestamp ? { since: u.lastStatusTimestamp } : {}),
      lat: u.lat,
      lng: u.lng,
      ...(u.eid !== undefined ? { eid: u.eid } : {}),
      num1: u.num1,
    };
    const alt = best.get(id);
    if (!alt || Date.parse(neu.since ?? "") > Date.parse(alt.since ?? "")) best.set(id, neu);
  }
  return [...best.values()];
}

// ─── Einsaetze (events) ──────────────────────────────────────────────

export interface ElsEvent {
  num1: string;
  eid?: number;
  /** Uebungsalarm der Leitstelle. */
  exercise: boolean;
  /** "N" = darf nicht veroeffentlicht werden (z. B. sensibler Einsatz). */
  notPublish: boolean;
  tycod: string;
  subTycod: string;
  typ: string;
  sub: string;
  alarmText: string;
  alarmLevel: number | null;
  location: string;
  plz: string;
  area: string;
  locationInfo: string;
  lat: number | null;
  lng: number | null;
  createTime?: string;
  firstDispatchTime?: string;
  freeTime?: string;
}

export function parseEvent(raw: Record<string, unknown>): ElsEvent | null {
  const num1 = str(raw.num_1);
  if (!num1) return null;
  const lat = num(raw.latitude);
  const lng = num(raw.longitude);
  const eid = num(raw.eid);
  const create = elsZeitNachIso(raw.create_time);
  const first = elsZeitNachIso(raw.firstdispatch_time);
  const free = elsZeitNachIso(raw.free_time);
  const keinePos = lat === null || lng === null || (lat === 0 && lng === 0);
  return {
    num1,
    ...(eid !== null ? { eid } : {}),
    exercise: str(raw.exercise).toUpperCase() === "Y",
    notPublish: str(raw.not_publish).toUpperCase() === "Y",
    tycod: str(raw.tycod),
    subTycod: str(raw.sub_tycod),
    typ: str(raw.typ_eng),
    sub: str(raw.sub_eng),
    alarmText: str(raw.event_alarmtext),
    alarmLevel: num(raw.alarm_lev),
    location: str(raw.location),
    plz: str(raw.plz),
    area: str(raw.area),
    locationInfo: str(raw.location_info),
    lat: keinePos ? null : lat,
    lng: keinePos ? null : lng,
    ...(create ? { createTime: create } : {}),
    ...(first ? { firstDispatchTime: first } : {}),
    ...(free ? { freeTime: free } : {}),
  };
}

/** Stichwort-Zeile fuer Alarmtext/Push: "B0-FREI-ABF · Brand Abfall im Freien (Brand Container im Freien)". */
export function elsStichwort(e: ElsEvent): string {
  const code = [e.tycod, e.subTycod].filter(Boolean).join(" / ");
  const text = e.sub && e.sub !== e.typ ? `${e.typ} (${e.sub})` : e.typ;
  const teile = [code, text].filter(Boolean);
  return teile.length > 0 ? teile.join(" · ") : e.alarmText || "Alarm (ELS)";
}

/** Einsatzort-Text: bevorzugt `location`, sonst PLZ + Ort. */
export function elsEinsatzort(e: ElsEvent): string {
  if (e.location) return e.location;
  return [e.plz, e.area].filter(Boolean).join(" ");
}

/** Id, unter der ein ELS-Einsatz in alarmId/alarmIds eines Einsatz-Docs steht. */
export function elsAlarmId(num1: string): string {
  return `els-${num1}`;
}

/** Nur die Felder eines Einsatz-Docs, die der Abgleich braucht. */
export interface EinsatzKandidat {
  _id: string;
  status?: string;
  alarmId?: string;
  alarmIds?: string[];
  alarmierungZeit?: string;
  alarmierungText?: string;
  einsatzort?: string;
  koordinaten?: { lat?: number; lng?: number };
}

/** Zeitfenster und Naehe wie bei der Doppelalarm-Erkennung des BlaulichtSMS-Pollers. */
export const ELS_MATCH_FENSTER_MS = 20 * 60 * 1000;
export const ELS_MATCH_MAX_DIST_KM = 0.3;

function normText(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Ist dieser ELS-Einsatz schon in einem Einsatz-Doc vermerkt? */
export function istSchonVerknuepft(e: ElsEvent, docs: EinsatzKandidat[]): EinsatzKandidat | undefined {
  const id = elsAlarmId(e.num1);
  return docs.find((d) => d.alarmId === id || (d.alarmIds ?? []).includes(id));
}

/**
 * Sucht unter den AKTIVEN Einsaetzen den, der zu diesem ELS-Einsatz gehoert:
 * Alarmzeit innerhalb 20 min UND (Koordinaten < 300 m ODER gleicher Einsatzort-
 * text). Bei mehreren Treffern der zeitlich naechste. Nur ein Hinweis-Abgleich
 * wie bei der Doppelalarm-Erkennung — es wird nichts zusammengefuehrt, nur
 * die ELS-Nummer am Einsatz vermerkt.
 */
export function findeKandidat(e: ElsEvent, docs: EinsatzKandidat[]): EinsatzKandidat | undefined {
  const bezug = Date.parse(e.firstDispatchTime ?? e.createTime ?? "");
  if (Number.isNaN(bezug)) return undefined;
  const ort = normText(elsEinsatzort(e));
  const treffer = docs
    .filter((d) => {
      if (d.status && d.status !== "aktiv") return false;
      const t = Date.parse(d.alarmierungZeit ?? "");
      if (Number.isNaN(t) || Math.abs(t - bezug) > ELS_MATCH_FENSTER_MS) return false;
      if (
        e.lat !== null &&
        e.lng !== null &&
        typeof d.koordinaten?.lat === "number" &&
        typeof d.koordinaten.lng === "number" &&
        haversineKm({ lat: e.lat, lng: e.lng }, { lat: d.koordinaten.lat, lng: d.koordinaten.lng }) < ELS_MATCH_MAX_DIST_KM
      ) {
        return true;
      }
      if (ort && normText(d.einsatzort) === ort) return true;
      return false;
    })
    .map((d) => ({ d, abstand: Math.abs(Date.parse(d.alarmierungZeit ?? "") - bezug) }))
    .sort((a, b) => a.abstand - b.abstand);
  return treffer[0]?.d;
}

/**
 * Soll dieser ELS-Einsatz bearbeitet werden? Nicht: Leitstellen-Uebungen,
 * als "nicht veroeffentlichen" markierte, bereits beendete (free_time) und
 * noch nicht alarmierte (kein firstdispatch).
 */
export function elsEventRelevant(e: ElsEvent): boolean {
  if (e.exercise || e.notPublish) return false;
  if (e.freeTime) return false;
  return !!e.firstDispatchTime;
}

/** Ist die Wartezeit (Gnadenfrist fuer BlaulichtSMS) seit der Alarmierung abgelaufen? */
export function graceAbgelaufen(e: ElsEvent, graceSec: number, jetztMs: number = Date.now()): boolean {
  const t = Date.parse(e.firstDispatchTime ?? "");
  if (Number.isNaN(t)) return false;
  return jetztMs - t >= graceSec * 1000;
}
