import nano from "nano";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";

/**
 * CouchDB-Client für die Backend-Operations.
 * In Phase 1 minimal — wird in späteren Phasen erweitert (Views, Replication-Endpoint).
 */

const auth = `${encodeURIComponent(env.COUCH_USER)}:${encodeURIComponent(env.COUCH_PASS)}`;
const url = env.COUCH_URL.replace("://", `://${auth}@`);

// A-06 (Audit 2026-07): Request-Timeout gegen Blackhole-Partitionen. Ohne
// Timeout haengt ein nano-Request unbegrenzt, wenn CouchDB zwar TCP annimmt
// aber nie antwortet (z. B. haengender Container, kaputtes NAT) — jeder
// wartende Route-Handler blockiert dann bis zum Client-Abbruch. 15 s ist
// grosszuegig ueber jeder realen CouchDB-Antwortzeit (Voll-Scans inklusive).
export const couch = nano({ url, requestDefaults: { timeout: 15000 } });

/**
 * CouchDB-Handle.
 * Wir typen es bewusst lose (`any`) — alle Domain-Schemas werden in der
 * Anwendungsschicht via Zod validiert, nicht in nano.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = couch.db.use<any>(env.COUCH_DB);

/**
 * Stellt sicher dass alle benötigten DBs existieren. Wird beim Server-Start
 * mit Retry-Logik aufgerufen — falls CouchDB beim Boot noch nicht erreichbar
 * ist, versuchen wir es mit exponential backoff.
 */
export async function ensureDatabase(): Promise<void> {
  await waitForCouch();
  for (const name of ["_users", "_replicator", "_global_changes", env.COUCH_DB]) {
    await ensureOne(name);
  }
  await ensureMangoIndizes();
}

/**
 * C-07 (Audit R3): Mango-Indizes fuer die heissen Selektor-Pfade —
 * ersetzt die bisherigen Praefix-Vollscans (db.list ueber einsatz: bzw.
 * fzgber:-Praefix):
 *
 *   type-status            → GET /api/einsaetze?status=aktiv (5-s-Poll),
 *                            Auto-Close-Worker (aktive + Orphan-Kandidaten)
 *   type-fahrzeugId-status → GET /api/fahrzeugberichte/meine (Tablet-Archiv)
 *
 * createIndex ist idempotent (CouchDB antwortet "exists" statt Fehler).
 * Fehler werden NUR geloggt — ohne Index laeuft db.find weiterhin (Mango
 * faellt auf _all_docs-Scan zurueck, nur langsamer), der Boot darf daran
 * nicht scheitern.
 */
async function ensureMangoIndizes(): Promise<void> {
  const indizes: Array<{ name: string; ddoc: string; fields: string[] }> = [
    { name: "type-status", ddoc: "idx-type-status", fields: ["type", "status"] },
    {
      name: "type-fahrzeugId-status",
      ddoc: "idx-type-fahrzeugId-status",
      fields: ["type", "fahrzeugId", "status"],
    },
  ];
  for (const idx of indizes) {
    try {
      const r = await db.createIndex({
        index: { fields: idx.fields },
        name: idx.name,
        ddoc: idx.ddoc,
      });
      logger.info({ index: idx.name, result: r.result }, "CouchDB: Mango-Index bereit");
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), index: idx.name },
        "CouchDB: Mango-Index konnte nicht angelegt werden — db.find laeuft ohne Index weiter",
      );
    }
  }
}

async function ensureOne(name: string): Promise<void> {
  try {
    await couch.db.get(name);
    logger.info({ db: name }, "CouchDB: DB existiert");
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) {
      try {
        await couch.db.create(name);
        logger.info({ db: name }, "CouchDB: DB neu angelegt");
      } catch (createErr) {
        const cs = (createErr as { statusCode?: number }).statusCode;
        if (cs !== 412) throw createErr;
      }
    } else {
      throw err;
    }
  }
}

async function waitForCouch(maxAttempts = 12): Promise<void> {
  let lastErr: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await couch.info();
      if (i > 1) logger.info({ attempts: i }, "CouchDB erreichbar");
      return;
    } catch (err) {
      lastErr = err;
      const wait = Math.min(8000, 500 * 2 ** Math.min(i, 4));
      logger.warn({ attempt: i, waitMs: wait }, "CouchDB noch nicht erreichbar, warte …");
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr ?? new Error("CouchDB unreachable");
}
