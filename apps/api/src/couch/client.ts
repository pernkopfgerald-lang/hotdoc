import nano from "nano";
import { env } from "../config.js";
import { logger } from "../lib/logger.js";

/**
 * CouchDB-Client für die Backend-Operations.
 * In Phase 1 minimal — wird in späteren Phasen erweitert (Views, Replication-Endpoint).
 */

const auth = `${encodeURIComponent(env.COUCH_USER)}:${encodeURIComponent(env.COUCH_PASS)}`;
const url = env.COUCH_URL.replace("://", `://${auth}@`);

export const couch = nano(url);

/**
 * CouchDB-Handle.
 * Wir typen es bewusst lose (`any`) — alle Domain-Schemas werden in der
 * Anwendungsschicht via Zod validiert, nicht in nano.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = couch.db.use<any>(env.COUCH_DB);

/**
 * Stellt sicher dass die DB existiert. Wird beim Server-Start aufgerufen.
 */
export async function ensureDatabase(): Promise<void> {
  try {
    await couch.db.get(env.COUCH_DB);
    logger.info({ db: env.COUCH_DB }, "CouchDB: DB existiert");
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) {
      await couch.db.create(env.COUCH_DB);
      logger.info({ db: env.COUCH_DB }, "CouchDB: DB neu angelegt");
    } else {
      throw err;
    }
  }
}
