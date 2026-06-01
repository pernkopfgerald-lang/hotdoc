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
 * Performance: ein db.get pro Token-Verify. Bei <100 aktiven Sitzungen
 * vernachlaessigbar. Bei deutlich groesserer Last waere ein In-Memory-LRU-
 * Cache vor dem DB-Lookup sinnvoll — TODO bei P-04.
 */

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
 * Implementation: einzelner db.get pro Call. Bei Audit-Schreibfehlern
 * (CouchDB-Outage) fallen wir auf `false` zurueck — d.h. wir akzeptieren
 * den Token. Begruendung: ein nicht-erreichbares CouchDB darf nicht die
 * gesamte API lahmlegen — der Token ist immer noch durch die JWT-Signatur
 * geschuetzt.
 *
 * TODO P-04: In-Memory-LRU-Cache vorschalten wenn >1000 Sitzungen.
 */
export async function isRevoked(sub: string, iat: number): Promise<boolean> {
  const id = makeBlacklistId(sub, iat);
  try {
    await db.get(id);
    return true;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
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
