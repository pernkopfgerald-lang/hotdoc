/**
 * Token-Blacklist — serverseitiges Revoke einzelner JWT-Tokens (F-34).
 *
 * Hintergrund: JWT-Tokens sind per Design "stateless" — wer den Schluessel
 * kennt, kann verifizieren, ohne den Server zu fragen. Das ist schnell,
 * aber bedeutet: ein einmal ausgestellter Token bleibt bis zur exp-Claim
 * gueltig, auch wenn das Geraet verloren geht oder ein Handoff ausgefuehrt
 * wurde.
 *
 * Diese Blacklist schliesst die Luecke fuer EINZELNE Tokens, die wir explizit
 * fuer ungueltig erklaeren wollen — ohne den globalen JWT-Schluessel zu
 * rotieren (was alle Sitzungen ungueltig wuerde).
 *
 * Identifikation eines Tokens: `(sub, iat)`. Der sub-Claim ist die
 * Benutzer-/Tablet-ID, iat ist der Issue-Zeitpunkt in Sekunden — zusammen
 * eindeutig fuer einen bestimmten Token (selbst wenn derselbe sub zwei
 * Tokens in derselben Sekunde bekommt, ist iat == iat → identischer Token).
 *
 * Speicherung als CouchDB-Doc:
 *   _id = `auth:blacklist:<sub>:<iat>`
 *   expiresAt = ISO-String — der audit-retention-Worker (oder ein dedizierter
 *               Cleanup) entfernt Eintraege deren expiresAt < now, damit die
 *               Blacklist nicht ewig waechst.
 *
 * Verwendung:
 *   - revokeToken() — beim Handoff-Release (Quell-Tablet legt seinen alten
 *     Token in die Blacklist) und beim spaeteren Login-Fail-Threshold.
 *   - isRevoked() — in verifySession() vor dem Akzeptieren eines Tokens.
 *
 * Performance (I-09): ein db.get pro Token-Verify, davor ein In-Memory-
 * Negativ-Cache (60 s) — der zweite und jeder weitere Request desselben
 * Tokens innerhalb der Minute kostet keinen CouchDB-Roundtrip mehr. Der
 * Lookup laeuft ueber eine eigene nano-Instanz mit kurzem Timeout (2 s),
 * damit ein haengendes CouchDB nicht jeden authentifizierten Request 15 s
 * blockiert (siehe unten).
 */

import nano from "nano";
import { env } from "../../config.js";
import { db } from "../../couch/client.js";
import { logger } from "../../lib/logger.js";

interface BlacklistDoc {
  _id: string;
  _rev?: string;
  type: "auth-blacklist";
  sub: string;
  iat: number;
  /** ISO-Zeitpunkt nach dem der Eintrag geloescht werden darf (Cleanup). */
  expiresAt: string;
  revokedAt: string;
  /** Optional: Grund fuer Audit-Trail (z.B. "handoff-release", "login-fail-threshold"). */
  reason?: string;
}

function makeBlacklistId(sub: string, iat: number): string {
  return `auth:blacklist:${sub}:${iat}`;
}

// ─── I-09: Eigene nano-Instanz NUR fuer den Blacklist-Lookup ────────────────
// Kurzer Timeout (2 s statt der 15 s des Shared-Clients in couch/client.ts).
// Grund: isRevoked() haengt an JEDEM authentifizierten Request. Ist CouchDB
// gerade nicht erreichbar (Blackhole, haengender Container), wuerde sonst
// jeder Request 15 s in der Auth-Middleware stecken, bevor fail-open greift —
// die Tablets erleben das als "API tot". 2 s liegt weit ueber der realen
// Antwortzeit eines einzelnen db.get und begrenzt den Schaden.
// URL-Aufbau identisch zu couch/client.ts (bewusst dupliziert — der Shared-
// Client bleibt unangetastet, Audit-Scope). revokeToken() schreibt weiterhin
// ueber den Shared-Client `db` (Schreibpfad darf den vollen Timeout haben).
const BLACKLIST_LOOKUP_TIMEOUT_MS = 2000;
const couchAuth = `${encodeURIComponent(env.COUCH_USER)}:${encodeURIComponent(env.COUCH_PASS)}`;
const couchUrl = env.COUCH_URL.replace("://", `://${couchAuth}@`);
const lookupDb = nano({
  url: couchUrl,
  requestDefaults: { timeout: BLACKLIST_LOOKUP_TIMEOUT_MS },
}).db.use<BlacklistDoc>(env.COUCH_DB);

// ─── I-09: Negativ-Cache ────────────────────────────────────────────────────
// Merkt sich fuer 60 s, dass ein (sub, iat) NICHT in der Blacklist steht —
// spart bei jedem weiteren Request desselben Tokens den CouchDB-Roundtrip.
// Ein Revoke ueber revokeToken() in DIESEM Prozess loescht den Eintrag
// sofort (kein 60-s-Fenster; die API laeuft single-instance auf fly).
// Positive Treffer (Token IST revoked) werden bewusst NICHT gecacht — die
// sind selten und sollen immer frisch geprueft werden. Lookup-Fehler
// (fail-open) werden ebenfalls nicht gecacht: wir WISSEN dann nichts.
const NEGATIVE_CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_MAX_ENTRIES = 5000;
/** key `${sub}:${iat}` → Zeitpunkt (Date.now()-basiert), ab dem der Eintrag abgelaufen ist. */
const negativeCache = new Map<string, number>();

function negativeCacheKey(sub: string, iat: number): string {
  return `${sub}:${iat}`;
}

/** True wenn fuer den Key ein noch gueltiger "nicht revoked"-Eintrag existiert. */
function isCachedNotRevoked(key: string): boolean {
  const until = negativeCache.get(key);
  if (until === undefined) return false;
  if (until <= Date.now()) {
    negativeCache.delete(key);
    return false;
  }
  return true;
}

function rememberNotRevoked(key: string): void {
  // Speicherschutz: bei Ueberlauf abgelaufene Eintraege raeumen; reicht das
  // nicht, den gesamten Cache verwerfen (ein Cache-Miss ist harmlos).
  if (negativeCache.size >= NEGATIVE_CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, until] of negativeCache) {
      if (until <= now) negativeCache.delete(k);
    }
    if (negativeCache.size >= NEGATIVE_CACHE_MAX_ENTRIES) negativeCache.clear();
  }
  negativeCache.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
}

/**
 * Markiert einen Token (identifiziert ueber sub+iat) als revoked.
 * Idempotent — wenn der Eintrag schon existiert, wird er nur aktualisiert
 * (revokedAt = neuer Zeitpunkt). Wirft NICHT bei Konflikt — Audit-flow
 * darf nicht blockiert werden.
 *
 * @param sub          JWT sub-Claim (Benutzer-ID / Tablet-ID).
 * @param iat          JWT iat-Claim (Issued-At in Sekunden).
 * @param expiresAtIso ISO-Zeitpunkt nach dem der Eintrag geloescht werden darf.
 *                     Im Normalfall = exp des Tokens, damit die Blacklist
 *                     genau so lange bestehen muss wie der Token sonst
 *                     gueltig waere.
 * @param reason       Optional — fuer den Audit-Trail.
 */
export async function revokeToken(
  sub: string,
  iat: number,
  expiresAtIso: string,
  reason?: string,
): Promise<void> {
  const id = makeBlacklistId(sub, iat);
  const now = new Date().toISOString();
  // I-09: Negativ-Cache-Eintrag sofort verwerfen — ab jetzt muss jeder
  // isRevoked()-Call fuer diesen Token wieder die DB fragen. Wird nach dem
  // Insert nochmals gemacht (Race: ein parallel laufender Lookup koennte
  // zwischen hier und dem Insert ein 404 zurueckbekommen und neu cachen).
  negativeCache.delete(negativeCacheKey(sub, iat));
  // Idempotenz: existierendes Doc holen, _rev mitnehmen.
  let existingRev: string | undefined;
  try {
    const existing = (await db.get(id)) as { _rev?: string };
    existingRev = existing._rev;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), id },
        "revokeToken: Konnte existierenden Eintrag nicht pruefen, versuche Insert",
      );
    }
  }
  const doc: BlacklistDoc = {
    _id: id,
    ...(existingRev ? { _rev: existingRev } : {}),
    type: "auth-blacklist",
    sub,
    iat,
    expiresAt: expiresAtIso,
    revokedAt: now,
    ...(reason ? { reason } : {}),
  };
  try {
    await db.insert(doc as Parameters<typeof db.insert>[0]);
    negativeCache.delete(negativeCacheKey(sub, iat));
    logger.info({ sub, iat, reason }, "Token revoked (Blacklist-Eintrag geschrieben)");
  } catch (err) {
    // Blacklist-Schreibfehler darf den User-Flow nicht blockieren — wir
    // loggen prominent damit der Operator es sieht.
    logger.error(
      { err: err instanceof Error ? err.message : String(err), sub, iat },
      "revokeToken FEHLGESCHLAGEN — Token bleibt formal gueltig bis exp",
    );
  }
}

/**
 * Prueft ob ein Token (identifiziert ueber sub+iat) in der Blacklist steht.
 *
 * Implementation (I-09): erst Negativ-Cache (60 s), dann einzelner db.get
 * ueber die Lookup-Instanz mit 2-s-Timeout. Bei Lookup-Fehlern (CouchDB-
 * Outage, Timeout) fallen wir auf `false` zurueck — d.h. wir akzeptieren
 * den Token. Begruendung: ein nicht-erreichbares CouchDB darf nicht die
 * gesamte API lahmlegen — der Token ist immer noch durch die JWT-Signatur
 * geschuetzt.
 */
export async function isRevoked(sub: string, iat: number): Promise<boolean> {
  const cacheKey = negativeCacheKey(sub, iat);
  if (isCachedNotRevoked(cacheKey)) return false;
  const id = makeBlacklistId(sub, iat);
  try {
    await lookupDb.get(id);
    return true;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      rememberNotRevoked(cacheKey);
      return false;
    }
    // Anderer Fehler (CouchDB unreachable, 500, etc.) — fail-open. Siehe
    // Begruendung im JSDoc oben.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), sub, iat },
      "isRevoked: Blacklist-Lookup fehlgeschlagen — fail-open",
    );
    return false;
  }
}
