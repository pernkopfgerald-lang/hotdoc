/**
 * Issue 17 (Einsatz-Test 2026-06-02): Objekt-Datenbank fuer Wiederholungs-
 * Einsaetze an der gleichen Adresse.
 *
 * Wenn ein Brand-Einsatz an einem Objekt auftritt, koennen Bauart, Lage und
 * Objektart als sinnvolle Defaults fuer einen Folge-Einsatz vorbelegt werden.
 * Beispiel: 2x Brand in derselben Lagerhalle in 6 Monaten — beim zweiten
 * Einsatz weiss der Wizard schon "Massivbauweise, Gewerbe/Industrie -> Lager",
 * der Einsatzleiter passt nur an was sich geaendert hat.
 *
 * Doc-Layout: objekt:<sha256(normalize(adresse)).slice(0,16)>
 * Inhalt: brandStatistik-Shape (entdeckung, ausmass, klassen, ...).
 *
 * Endpoints:
 *   - GET  /api/objekte/lookup?adresse=...  Hash, suchen, {found, data?} zurueck
 *   - PUT  /api/objekte/:hash               Upsert mit brandStatistik-Body
 *
 * requireAuth("einsatzleiter") fuer beide — das Tablet braucht es nicht,
 * nur die Florianstation pflegt den Datenstand.
 */

import { createHash } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const objekteRouter: Router = Router();

/**
 * Issue 17 (Einsatz-Test 2026-06-02): Normalisiert eine Adresse fuer
 * deterministisches Hashing. So treffen "Hauptstr. 12, 4653 Eberstalzell"
 * und "Hauptstraße 12, 4653  Eberstalzell" denselben Bucket.
 *
 * Schritte:
 *   1. lowercase
 *   2. Umlaute + ß auflösen (oe, ae, ue, ss)
 *   3. mehrfache Whitespaces collapsen
 *   4. Strasse/Str./Strasze → str
 *   5. Trim, Sonderzeichen außer Alphanumerisch/Komma/Bindestrich/Leerz. raus
 *   6. Komma + Whitespace einheitlich machen ("Strasse 12,Ort" === "Strasse 12, Ort")
 */
export function normalizeAdresse(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\bstraße\b/g, "str")
    .replace(/\bstrasse\b/g, "str")
    .replace(/\bstr\.\b/g, "str")
    .replace(/[^a-z0-9, \-]/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SHA256-Hash der normalisierten Adresse, gekuerzt auf 16 Zeichen.
 * Kuerzung ist OK weil CouchDB die ID ohnehin per "objekt:" prefixed
 * und 16 hex chars = 64 bit Eindeutigkeit (= 1 Kollision pro ~4 Mrd.
 * Adressen — fuer eine Gemeinde mit ~3000 Adressen voellig irrelevant).
 */
export function hashAdresse(adresse: string): string {
  const norm = normalizeAdresse(adresse);
  return createHash("sha256").update(norm, "utf-8").digest("hex").slice(0, 16);
}

// ─── GET /api/objekte/lookup?adresse=... ─────────────────────
// Wird vom BrandAbschlussWizard beim Open aufgerufen damit Defaults
// vorbelegt werden. 404 = noch keine Daten gespeichert (found:false).
objekteRouter.get(
  "/api/objekte/lookup",
  requireAuth("einsatzleiter"),
  (async (req, res) => {
    const adresseRaw = req.query.adresse;
    const adresse = typeof adresseRaw === "string" ? adresseRaw.trim() : "";
    if (!adresse) {
      res.status(400).json({ error: "adresse_required" });
      return;
    }
    const hash = hashAdresse(adresse);
    const docId = `objekt:${hash}`;
    try {
      const doc = (await db.get(docId)) as Record<string, unknown>;
      res.json({ ok: true, found: true, hash, data: doc.data ?? {} });
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) {
        res.json({ ok: true, found: false, hash });
        return;
      }
      throw err;
    }
  }) as RequestHandler,
);

// ─── PUT /api/objekte/:hash ──────────────────────────────────
// Upsert. Body = das aktuelle brandStatistik-Snapshot (irgendein
// JSON-Objekt — wir validieren nicht zu eng damit das Schema
// zukuenftig erweitert werden kann ohne PUT zu brechen).
objekteRouter.put(
  "/api/objekte/:hash",
  requireAuth("einsatzleiter"),
  (async (req, res) => {
    const hash = decodeURIComponent(String(req.params.hash));
    if (!/^[0-9a-f]{16}$/.test(hash)) {
      res.status(400).json({ error: "invalid_hash", hint: "16 hex Zeichen erwartet" });
      return;
    }
    const docId = `objekt:${hash}`;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    let _rev: string | undefined;
    let createdAt: string = now;
    try {
      const existing = (await db.get(docId)) as Record<string, unknown>;
      _rev = (existing as { _rev?: string })._rev;
      const existingCreated = (existing as { erstelltAm?: string }).erstelltAm;
      if (typeof existingCreated === "string") createdAt = existingCreated;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }
    const doc = {
      _id: docId,
      ...(_rev ? { _rev } : {}),
      type: "objekt" as const,
      hash,
      // adresse als plain-Text mitspeichern, NICHT nur Hash — fuer Debug
      // und damit der Funktionaer im Backoffice die Liste lesbar bekommt.
      adresse: typeof body.adresse === "string" ? body.adresse : undefined,
      data: body.data ?? body,  // accept either {data: {...}} or raw shape
      erstelltAm: createdAt,
      geaendertAm: now,
    };
    // OPT-6a (Audit 2026-06-03): Lookup→_rev→insert war nicht conflict-sicher.
    // Zwei Florian-Sessions die gleichzeitig dasselbe objekt:<hash> anlegen
    // (oder updaten) → der zweite insert wirft 409. Wir holen bei 409 die
    // frische _rev und versuchen genau 1x erneut. Bei finalem 409 → 409
    // conflict an den Client.
    let result: Awaited<ReturnType<typeof db.insert>>;
    try {
      result = await db.insert(doc as Parameters<typeof db.insert>[0]);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) throw err;
      logger.info({ docId, hash }, "PUT objekt: 409 Conflict — Retry mit frischer _rev");
      try {
        const fresh = (await db.get(docId)) as { _rev?: string };
        result = await db.insert({ ...doc, _rev: fresh._rev } as Parameters<typeof db.insert>[0]);
      } catch (retryErr) {
        if ((retryErr as { statusCode?: number }).statusCode === 409) {
          logger.warn({ docId, hash }, "PUT objekt: Retry erneut 409");
          res.status(409).json({ error: "conflict" });
          return;
        }
        throw retryErr;
      }
    }
    logger.info(
      { docId, hash, by: req.session?.username },
      "Objekt-Datenbank aktualisiert (Brand-Wiederholung-Cache)",
    );
    res.json({ ok: true, hash, id: docId, rev: result.rev });
  }) as RequestHandler,
);
