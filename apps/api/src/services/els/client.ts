/**
 * Client fuer die ELS-Schnittstelle des Landesfeuerwehrverbands
 * (https://einsatz-api.ooelfv.at, Beschreibung: /swagger/ bzw. /openapi.json).
 *
 * Token-Modell (laut Schnittstellenbeschreibung):
 *  - Register-Token (aus syBOS, wird per Secret gesetzt) -> POST /API/client/register
 *    liefert Access- + Refresh-Token. ACHTUNG: entwertet ALLE bisher ausgestellten
 *    Token und ist danach 60 min gesperrt.
 *  - Refresh-Token -> POST /API/client/renew liefert einen neuen Access-Token
 *    (entwertet die alten Access-Token, danach 60 min gesperrt).
 *  - Access-Token (14 Tage gueltig) -> Bearer fuer alle Datenabrufe.
 *
 * Deshalb werden die ausgestellten Token in CouchDB (`state:els-token`)
 * gespeichert: ein API-Neustart/Deploy darf NICHT jedes Mal neu registrieren
 * (wuerde andere Systeme auf demselben Token abschalten und fuer 60 min sperren).
 * Es wird nur registriert, wenn gar keine Token da sind oder der Refresh-Token
 * abgelehnt wird; erneuert wird rechtzeitig vor Ablauf des Access-Tokens.
 *
 * Datenschutz: Die Daten duerfen laut Nutzungsbedingungen nur den aktiven
 * Mitgliedern und Reservisten der eigenen Feuerwehr gezeigt werden; Token und
 * Anruferdaten werden nie geloggt.
 */

import { env, hasEls } from "../../config.js";
import { db } from "../../couch/client.js";
import { logger } from "../../lib/logger.js";
import { extractList, jwtExpMs } from "./logik.js";

const TOKEN_DOC_ID = "state:els-token";
/** Access-Token erneuern, wenn weniger als 24 h Restlaufzeit. */
const RENEW_VOR_ABLAUF_MS = 24 * 60 * 60 * 1000;
/** Nach jeder Nutzung von Register-/Refresh-Token ist dieser gesperrt. */
const SPERRE_MS = 60 * 60 * 1000;
/** Annahme, falls im Token kein `exp` steht (Schnittstelle nennt 14 Tage). */
const FALLBACK_LAUFZEIT_MS = 13 * 24 * 60 * 60 * 1000;
const HTTP_TIMEOUT_MS = 12_000;

interface TokenDoc {
  _id: string;
  _rev?: string;
  type: "state";
  accessToken?: string;
  refreshToken?: string;
  /** Ablauf des Access-Tokens (ms seit Epoche). */
  accessExpMs?: number;
  /** Register-Token darf erst wieder ab diesem Zeitpunkt benutzt werden. */
  registerSperreBis?: number;
  /** Refresh-Token darf erst wieder ab diesem Zeitpunkt benutzt werden. */
  refreshSperreBis?: number;
  geaendertAm: string;
}

export class ElsFehler extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ElsFehler";
  }
}

let cache: TokenDoc | null = null;
let tokenArbeit: Promise<string> | null = null;
/** Letzter Hinweis zum Token-Zustand fuer die Health-Anzeige (kein Secret). */
let tokenHinweis = "";

export function getTokenHinweis(): string {
  return tokenHinweis;
}

function statusCode(err: unknown): number | undefined {
  return (err as { statusCode?: number }).statusCode;
}

async function ladeTokenDoc(): Promise<TokenDoc> {
  if (cache) return cache;
  try {
    cache = (await db.get(TOKEN_DOC_ID)) as TokenDoc;
  } catch (err) {
    if (statusCode(err) !== 404) throw err;
    cache = { _id: TOKEN_DOC_ID, type: "state", geaendertAm: new Date().toISOString() };
  }
  return cache;
}

async function speichereTokenDoc(doc: TokenDoc): Promise<void> {
  const neu: TokenDoc = { ...doc, geaendertAm: new Date().toISOString() };
  try {
    const r = await db.insert(neu);
    cache = { ...neu, _rev: r.rev };
  } catch (err) {
    if (statusCode(err) === 409) {
      // Zweite Instanz hat gerade geschrieben -> frisch laden, Werte zusammenfuehren.
      cache = null;
      const frisch = await ladeTokenDoc();
      const r = await db.insert({ ...frisch, ...neu, _rev: frisch._rev });
      cache = { ...frisch, ...neu, _rev: r.rev };
      return;
    }
    throw err;
  }
}

async function postJson(pfad: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${env.ELS_API_URL}${pfad}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new ElsFehler(`ELS ${pfad}: HTTP ${res.status}`, res.status);
  return res.json();
}

function leseTokenAntwort(json: unknown): { access: string; refresh?: string } {
  const o = (json ?? {}) as Record<string, unknown>;
  const access = typeof o.access_token === "string" ? o.access_token : "";
  if (!access) throw new ElsFehler("ELS: Antwort ohne access_token");
  const refresh = typeof o.refresh_token === "string" && o.refresh_token ? o.refresh_token : undefined;
  return { access, ...(refresh ? { refresh } : {}) };
}

async function registrieren(doc: TokenDoc): Promise<TokenDoc> {
  if (!env.ELS_REGISTER_TOKEN || !env.ELS_STATION_ID) throw new ElsFehler("ELS nicht konfiguriert");
  if (doc.registerSperreBis && Date.now() < doc.registerSperreBis) {
    throw new ElsFehler(
      `Register-Token gesperrt bis ${new Date(doc.registerSperreBis).toLocaleTimeString("de-AT", { timeZone: "Europe/Vienna" })}`,
      429,
    );
  }
  // Sperre VOR dem Aufruf merken: scheitert der Aufruf unterwegs, darf der
  // naechste Poll ihn nicht sofort wiederholen (Schnittstelle sperrt 60 min).
  const gesperrt: TokenDoc = { ...doc, registerSperreBis: Date.now() + SPERRE_MS };
  await speichereTokenDoc(gesperrt);
  logger.warn("ELS: Register-Token wird verwendet (alle bisherigen ELS-Token werden damit entwertet)");
  const json = await postJson("/API/client/register", {
    register_token: env.ELS_REGISTER_TOKEN,
    station_id: env.ELS_STATION_ID,
    system: env.ELS_SYSTEM_NAME,
  });
  const t = leseTokenAntwort(json);
  const neu: TokenDoc = {
    ...(cache ?? gesperrt),
    accessToken: t.access,
    ...(t.refresh ? { refreshToken: t.refresh } : {}),
    accessExpMs: jwtExpMs(t.access) ?? Date.now() + FALLBACK_LAUFZEIT_MS,
    registerSperreBis: Date.now() + SPERRE_MS,
    // Nach register ist auch der frische Refresh-Token nutzbar; Sperre gilt erst nach Nutzung.
    refreshSperreBis: undefined,
  };
  await speichereTokenDoc(neu);
  return cache ?? neu;
}

async function erneuern(doc: TokenDoc): Promise<TokenDoc> {
  if (!doc.refreshToken) throw new ElsFehler("Kein Refresh-Token vorhanden", 404);
  if (doc.refreshSperreBis && Date.now() < doc.refreshSperreBis) {
    throw new ElsFehler("Refresh-Token vorübergehend gesperrt", 429);
  }
  const gesperrt: TokenDoc = { ...doc, refreshSperreBis: Date.now() + SPERRE_MS };
  await speichereTokenDoc(gesperrt);
  const json = await postJson("/API/client/renew", { refresh_token: doc.refreshToken });
  const t = leseTokenAntwort(json);
  const neu: TokenDoc = {
    ...(cache ?? gesperrt),
    accessToken: t.access,
    accessExpMs: jwtExpMs(t.access) ?? Date.now() + FALLBACK_LAUFZEIT_MS,
    refreshSperreBis: Date.now() + SPERRE_MS,
  };
  await speichereTokenDoc(neu);
  return cache ?? neu;
}

/**
 * Liefert einen gueltigen Access-Token. Genau ein Vorgang gleichzeitig; wirft
 * ElsFehler mit verstaendlicher Meldung, wenn keiner beschafft werden kann.
 * `erzwingeErneuern`: nach 401/403 vom Datenabruf.
 */
export function getAccessToken(erzwingeErneuern = false): Promise<string> {
  if (!hasEls()) return Promise.reject(new ElsFehler("ELS nicht konfiguriert"));
  if (tokenArbeit) return tokenArbeit;
  tokenArbeit = holeAccessToken(erzwingeErneuern).finally(() => {
    tokenArbeit = null;
  });
  return tokenArbeit;
}

async function holeAccessToken(erzwingeErneuern: boolean): Promise<string> {
  let doc = await ladeTokenDoc();
  const restMs = (doc.accessExpMs ?? 0) - Date.now();
  if (doc.accessToken && !erzwingeErneuern && restMs > RENEW_VOR_ABLAUF_MS) {
    tokenHinweis = "";
    return doc.accessToken;
  }

  // 1. Erneuern, solange ein Refresh-Token da ist (nicht gesperrt).
  if (doc.refreshToken) {
    try {
      doc = await erneuern(doc);
      tokenHinweis = "";
      logger.info("ELS: Access-Token erneuert");
      return doc.accessToken as string;
    } catch (err) {
      doc = cache ?? doc; // enthaelt die frisch gesetzte Sperre (richtige _rev)
      const status = err instanceof ElsFehler ? err.status : undefined;
      // Gesperrt oder Netzfehler: der alte Token laeuft evtl. noch -> weiter damit.
      if (doc.accessToken && restMs > 0 && (status === 429 || status === undefined)) {
        tokenHinweis = "Token-Erneuerung aktuell nicht möglich, alter Token wird weiterverwendet";
        return doc.accessToken;
      }
      if (status !== 403 && status !== 404) {
        tokenHinweis = `Token-Erneuerung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
        throw err;
      }
      logger.warn("ELS: Refresh-Token abgelehnt — registriere neu");
    }
  }

  // 2. Neu registrieren (keine Token vorhanden oder Refresh abgelehnt).
  try {
    doc = await registrieren(doc);
    tokenHinweis = "";
    return doc.accessToken as string;
  } catch (err) {
    tokenHinweis = `Registrierung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`;
    if (err instanceof ElsFehler && err.status === 404) {
      tokenHinweis = "Register-Token oder Stations-ID unbekannt (404) — Werte in syBOS prüfen";
    } else if (err instanceof ElsFehler && err.status === 403) {
      tokenHinweis = "Register-Token darf keine Token ausstellen (403)";
    }
    throw err;
  }
}

async function getJson(pfad: string, token: string): Promise<{ status: number; json?: unknown }> {
  const res = await fetch(`${env.ELS_API_URL}${pfad}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 403) return { status: res.status };
  if (!res.ok) throw new ElsFehler(`ELS ${pfad}: HTTP ${res.status}`, res.status);
  return { status: res.status, json: await res.json() };
}

/**
 * GET mit Bearer; bei 401/403 genau einmal Token erneuern und wiederholen.
 * `key` stempelt den Abruf fuer den Limit-Schutz — erst wenn ein Token da ist
 * und die Anfrage wirklich rausgeht (ein gescheiterter Token-Vorgang verbraucht
 * das Abruf-Limit nicht).
 */
async function abruf(pfad: string, key: string): Promise<unknown> {
  let token = await getAccessToken();
  letzterAbruf.set(key, Date.now());
  let r = await getJson(pfad, token);
  if (r.status === 401 || r.status === 403) {
    token = await getAccessToken(true);
    letzterAbruf.set(key, Date.now());
    r = await getJson(pfad, token);
    if (r.status === 401 || r.status === 403) throw new ElsFehler(`ELS ${pfad}: nicht autorisiert (${r.status})`, r.status);
  }
  return r.json;
}

// ─── Datenabrufe mit Rate-Limit-Schutz ───────────────────────────────

const letzterAbruf = new Map<string, number>();
const MIN_INTERVALL_MS: Record<string, number> = {
  units: 60_000,
  events: 5_000,
};

/** Wirft, wenn der letzte tatsaechliche Abruf noch kein volles Limit zurueckliegt. */
function pruefeLimit(key: string): void {
  const min = MIN_INTERVALL_MS[key] ?? 0;
  const last = letzterAbruf.get(key) ?? 0;
  if (Date.now() - last < min) {
    throw new ElsFehler(`ELS ${key}: Abruf-Limit (${Math.round(min / 1000)} s) — zu früh`, 429);
  }
}

/** Alle Einheiten der Feuerwehr (Limit der Schnittstelle: 60 s). */
export async function holeUnitsRoh(): Promise<Record<string, unknown>[]> {
  pruefeLimit("units");
  return extractList(await abruf("/API/v1/export/units", "units"), "unit");
}

/** Alle offenen Einsaetze der Feuerwehr (Limit der Schnittstelle: 5 s). */
export async function holeEventsRoh(): Promise<Record<string, unknown>[]> {
  pruefeLimit("events");
  return extractList(await abruf("/API/v1/export/events", "events"), "event");
}
