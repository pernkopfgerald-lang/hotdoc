/**
 * Einsatz- + Fahrzeugbericht-CRUD — FR-2, FR-3, FR-6, FR-12, FR-13, FR-14.
 *
 * - GET    /api/einsaetze            Liste (aktiv + abgeschlossen, mit Filter)
 * - GET    /api/einsaetze/:id        Detail
 * - POST   /api/einsaetze/manuell    Neuen manuellen Bericht anlegen (FR-12)
 * - POST   /api/einsaetze/:id/abschluss     Bericht abschließen → schreibschutz=true
 * - POST   /api/einsaetze/:id/reaktivieren  Mit Pflicht-Grund (FR-14)
 * - GET    /api/einsaetze/:id/fahrzeugberichte
 * - PUT    /api/einsaetze/:id/fahrzeugbericht/:fzgId
 */

import { randomUUID } from "node:crypto";
import { Router, type Response, type RequestHandler } from "express";
import { z } from "zod";
import { EinsatzSchema, FahrzeugberichtSchema } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { writeAuditEvent } from "../services/audit.js";

export const einsaetzeRouter: Router = Router();

/**
 * Helper: laedt einen Einsatz oder schickt direkt 404. Spart in den
 * :id-Routen den try/catch-Boilerplate und behandelt 404 konsistent.
 * Rueckgabe `null` signalisiert: Response wurde bereits geschickt,
 * Caller muss `return;` machen.
 */
async function getEinsatzOr404(
  id: string,
  res: Response,
): Promise<Record<string, unknown> | null> {
  try {
    return (await db.get(id)) as Record<string, unknown>;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "einsatz_not_found" });
      return null;
    }
    throw err;
  }
}

/**
 * Bulk-Update mit per-doc Conflict-Retry.
 *
 * CouchDB-Bulk gibt fuer jedes Doc einen Status — bei `error: "conflict"`
 * (frische _rev hat sich seit unserem fetch geaendert) holen wir das Doc
 * neu, setzen den frischen _rev ein, und versuchen genau 1x mit single-
 * insert nachzuziehen. Wenn auch das fehlschlaegt, sammeln wir die IDs
 * in `failed[]` damit der Caller einen `cascade_failed`-Marker setzen
 * kann (Sichtbarkeit fuer manuellen Cleanup).
 *
 * @returns ok = Anzahl erfolgreicher Updates inkl. Retries,
 *          failed = Liste der IDs die endgueltig fehlgeschlagen sind
 */
async function bulkUpdateWithRetry(
  docs: Array<Record<string, unknown>>,
  log: typeof logger,
): Promise<{ ok: number; failed: string[] }> {
  if (docs.length === 0) return { ok: 0, failed: [] };
  const bulkResult = await db.bulk({ docs });
  const failed: string[] = [];
  let ok = 0;
  for (let i = 0; i < bulkResult.length; i++) {
    const row = bulkResult[i];
    const sourceDoc = docs[i];
    if (!row || !sourceDoc) continue;
    if (!row.error) {
      ok += 1;
      continue;
    }
    const docId = (sourceDoc._id as string | undefined) ?? row.id;
    if (row.error !== "conflict" || !docId) {
      failed.push(docId ?? "unknown");
      log.warn(
        { id: docId, error: row.error, reason: row.reason },
        "bulkUpdateWithRetry: nicht-conflict-Fehler, kein Retry",
      );
      continue;
    }
    // Retry-Pfad: CouchDB-Conflict — frischen _rev holen und nochmal
    // mit single-insert versuchen.
    try {
      const fresh = (await db.get(docId)) as Record<string, unknown>;
      const merged: Record<string, unknown> = {
        ...sourceDoc,
        _rev: fresh._rev,
      };
      await db.insert(merged as Parameters<typeof db.insert>[0]);
      ok += 1;
      log.info(
        { id: docId },
        "bulkUpdateWithRetry: Conflict per single-insert geloest",
      );
    } catch (err) {
      failed.push(docId);
      log.warn(
        { err, id: docId },
        "bulkUpdateWithRetry: Retry fehlgeschlagen — Doc bleibt im alten Zustand",
      );
    }
  }
  return { ok, failed };
}

// ─── GET /api/einsaetze ─────────────────────────────────────
// F-29: Pagination via `limit` (Default 200, Max 500) + `skip`. Sortierung
// und Filterung passieren weiterhin in JS — bei <1000 Einsaetzen unkritisch.
// Response um `total`, `limit`, `skip` erweitert; `items` bleibt bestehende
// Liste damit Konsumenten nicht brechen.
// TODO P-05: Auf Mango-View (durch Index auf alarmierungZeit + status) migrieren wenn >1000 Einsätze
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 500;
einsaetzeRouter.get("/api/einsaetze", requireAuth(), (async (req, res) => {
  const status = req.query.status as string | undefined;
  // Pagination-Parameter — defensive parse, clamp auf erlaubte Range
  const rawLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;
  const rawSkip = Number.parseInt(String(req.query.skip ?? ""), 10);
  const skip = Number.isFinite(rawSkip) && rawSkip > 0 ? rawSkip : 0;

  const list = await db.list({
    startkey: "einsatz:",
    endkey: "einsatz:￰",
    include_docs: true,
    descending: false,
  });
  let docs = list.rows
    .map((r) => r.doc)
    .filter((d): d is NonNullable<typeof d> => d !== undefined)
    .filter((d) => (d as { type?: string }).type === "einsatz");

  if (status === "aktiv" || status === "abgeschlossen") {
    docs = docs.filter((d) => (d as { status?: string }).status === status);
  }

  // Fahrzeug-Filter: jedes Fahrzeug-Tablet schickt seine eigene Id mit,
  // damit es nur Einsaetze sieht die ihm explizit zugewiesen sind (oder
  // ueberhaupt keine Zuweisung tragen = Default offen). Florianstation
  // schickt keinen Filter und sieht alle aktiven Einsaetze.
  const fuerFahrzeugRaw = req.query.fuerFahrzeug;
  const fuerFahrzeug =
    typeof fuerFahrzeugRaw === "string" ? fuerFahrzeugRaw : "";
  if (fuerFahrzeug) {
    docs = docs.filter((d) => {
      const z = (d as { zugewieseneFahrzeuge?: string[] }).zugewieseneFahrzeuge;
      if (!Array.isArray(z) || z.length === 0) return true;
      return z.includes(fuerFahrzeug);
    });
  }

  docs.sort(
    (a, b) =>
      new Date((b as { alarmierungZeit: string }).alarmierungZeit).getTime() -
      new Date((a as { alarmierungZeit: string }).alarmierungZeit).getTime(),
  );
  // total = Gesamtanzahl NACH Filter, VOR Pagination — fuer UI-Anzeige
  // "Zeige 1-200 von 423".
  const total = docs.length;
  const items = docs.slice(skip, skip + limit);
  res.json({ ok: true, items, total, limit, skip });
}) as RequestHandler);

// ─── GET /api/einsaetze/:id ─────────────────────────────────
einsaetzeRouter.get("/api/einsaetze/:id", requireAuth(), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  try {
    const doc = await db.get(id);
    res.json(doc);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    throw err;
  }
}) as RequestHandler);

// ─── POST /api/einsaetze/manuell ─── FR-12 + Lotsendienst + Übung ───
const ManuellAnlageBodySchema = z.object({
  /**
   * Welcher Typ: manuell (Default = Sonstiges ohne Alarm), lotsendienst,
   * oder uebung. Alle drei laufen durch dieselbe Anlage-Route, weil die
   * UI-Felder ähnlich sind und der Workflow (kein BlaulichtSMS) gleich.
   */
  einsatzTyp: z.enum(["manuell", "lotsendienst", "uebung"]).default("manuell"),
  einsatzort: z.string().min(3),
  einsatzart: z.string().optional(),
  einsatzartFreitext: z.string().optional(),
  alarmierungZeit: z.string().datetime().optional(),
  grund: z.string().optional(),
  /** Aus dem Geocoder (Photon) — wandert ins Einsatz-Doc damit die
   *  Florian-Karte direkt einen Marker am Einsatzort zeigt. */
  koordinaten: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  // Lotsendienst-Felder
  lotsendienstAuftraggeber: z.string().optional(),
  lotsendienstRoute: z.string().optional(),
  // Übungs-Felder
  uebungThema: z.string().optional(),
  uebungsleiter: z.string().optional(),
  uebungsTyp: z
    .enum([
      "Atemschutz",
      "Technische Hilfeleistung",
      "Höhenrettung",
      "Sanitätsdienst",
      "Funk",
      "Allgemeine Übung",
      "Bewerb",
      "Sonstige",
    ])
    .optional(),
  verrechenbar: z.boolean().optional(),
  rechnungsadresse: z.string().optional(),
  /** Auto-Pflichtbereich-Erkennung (siehe routes/geocoding.ts:isInEberstalzell).
   *  Wenn der Einsatzort in der Eberstalzell-Bbox liegt, setzt das Tablet
   *  diese Werte auf true beim Anlegen. Der Florian-Editor uebernimmt sie
   *  als Default; der User kann sie immer noch manuell ueberschreiben. */
  pflichtbereich: z.boolean().optional(),
  einsatzzoneEzell: z.boolean().optional(),
  /** Disposition: welche Fahrzeuge bearbeiten den Einsatz?
   *  Leer/undefined → alle Fahrzeuge sehen ihn (Default). */
  zugewieseneFahrzeuge: z
    .array(z.enum(["kdo", "tlf-a-4000", "lfa-b", "mtf"]))
    .optional(),
  /** Client-generierte UUID fuer Idempotenz. Wenn das Tablet den POST wegen
   *  Netz-Wackler retryt, wird derselbe Einsatz nicht doppelt angelegt — der
   *  Server findet die existierende Doc-ID und gibt sie zurueck. Optional fuer
   *  Backwards-Compat; wenn nicht gesetzt, generiert der Server eine UUID
   *  (kein Idempotenz-Schutz). */
  idempotencyKey: z.string().uuid().optional(),
});

// Mannschaft+ darf anlegen — Fahrzeug-Tablets brauchen das fuer
// eigenstaendige Uebungen, Lotsendienste und Sturm-Eins. Einsatzleiter ist
// nicht mehr Pflicht.
einsaetzeRouter.post("/api/einsaetze/manuell", requireAuth("mannschaft"), (async (req, res) => {
  const parsed = ManuellAnlageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const session = req.session!;
  const now = new Date().toISOString();
  const d = parsed.data;
  // ID-Präfix je nach Typ damit man im CouchDB direkt sieht was es ist
  const idPrefix =
    d.einsatzTyp === "lotsendienst"
      ? "einsatz:lotsendienst-"
      : d.einsatzTyp === "uebung"
        ? "einsatz:uebung-"
        : "einsatz:manuell-";
  // Idempotenz: wenn der Client einen idempotencyKey schickt, nutzen wir
  // ihn als UUID-Teil der Doc-ID. Retry mit gleichem Key → CouchDB findet
  // die Doc, wir geben sie zurueck statt eine zweite anzulegen.
  const idemPart = d.idempotencyKey ?? randomUUID();
  const docId = `${idPrefix}${idemPart}`;
  try {
    const existing = (await db.get(docId)) as { _id: string; _rev: string };
    logger.info({ docId, idempotencyKey: d.idempotencyKey }, "Manuell-Anlage: idempotent (existierender Einsatz zurueckgegeben)");
    res.json({ ok: true, id: existing._id, rev: existing._rev, idempotent: true });
    return;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) throw err;
  }
  const doc = {
    _id: docId,
    type: "einsatz" as const,
    einsatzTyp: d.einsatzTyp,
    manuellAngelegt: {
      vonBenutzerId: session.sub,
      am: now,
      ...(d.grund ? { grund: d.grund } : {}),
    },
    einsatzort: d.einsatzort,
    alarmierungZeit: d.alarmierungZeit ?? now,
    ...(d.einsatzart ? { einsatzart: d.einsatzart } : {}),
    ...(d.einsatzartFreitext ? { einsatzartFreitext: d.einsatzartFreitext } : {}),
    ...(d.koordinaten ? { koordinaten: d.koordinaten } : {}),
    // Typ-spezifische Felder — alle optional im Schema
    ...(d.lotsendienstAuftraggeber
      ? { lotsendienstAuftraggeber: d.lotsendienstAuftraggeber }
      : {}),
    ...(d.lotsendienstRoute ? { lotsendienstRoute: d.lotsendienstRoute } : {}),
    ...(d.uebungThema ? { uebungThema: d.uebungThema } : {}),
    ...(d.uebungsleiter ? { uebungsleiter: d.uebungsleiter } : {}),
    ...(d.uebungsTyp ? { uebungsTyp: d.uebungsTyp } : {}),
    ...(d.zugewieseneFahrzeuge && d.zugewieseneFahrzeuge.length > 0
      ? { zugewieseneFahrzeuge: d.zugewieseneFahrzeuge }
      : {}),
    // Auto-Pflichtbereich aus Geocoder-Erkennung: wenn der Client den Wert
    // mitschickt (weil GPS in Eberstalzell-Bbox), uebernehmen wir ihn als
    // Vorbefuellung — Florian-Editor zeigt die Checkbox bereits gesetzt,
    // User kann das immer noch in der UI uebersteuern.
    ...(d.pflichtbereich !== undefined ? { pflichtbereich: d.pflichtbereich } : {}),
    ...(d.einsatzzoneEzell !== undefined ? { einsatzzoneEzell: d.einsatzzoneEzell } : {}),
    zeitmarken: {},
    beteiligteStellen: [],
    sonstigeAnwesendeFF: { aktive: [] },
    mannschaft: { bereitschaft: 0, sonstige: 0 },
    verrechnung: {
      verrechenbar: d.verrechenbar ?? d.einsatzTyp === "lotsendienst",
      ...(d.rechnungsadresse ? { rechnungsadresse: d.rechnungsadresse } : {}),
    },
    oelbindemittel: { verwendet: false, gesamtSaecke: 0 },
    meldungEinsatzleitung: "",
    reaktivierungen: [],
    schreibschutz: false,
    status: "aktiv" as const,
    fahrzeugPositionen: [],
    chronik: [],
    erstelltAm: now,
    geaendertAm: now,
  };
  // Validate via Zod
  const validated = EinsatzSchema.safeParse(doc);
  if (!validated.success) {
    logger.error({ issues: validated.error.flatten() }, "Manueller Einsatz validierte nicht");
    res.status(500).json({ error: "schema_invalid", details: validated.error.flatten() });
    return;
  }
  try {
    const result = await db.insert(doc);
    logger.info({ id: doc._id, by: session.username }, "Manueller Einsatz angelegt");
    res.status(201).json({ ok: true, id: doc._id, rev: result.rev });
  } catch (err) {
    // 409 — Race-Condition zwischen dem GET oben und diesem INSERT.
    // Kann passieren wenn zwei Tablet-Retries fast gleichzeitig durchgehen
    // und unser erster get(docId) noch 404 sah aber inzwischen das andere
    // Tablet die Doc angelegt hat. Wir behandeln das wie den klassischen
    // Idempotenz-Pfad oben: existierendes Doc holen und zurueckgeben.
    if ((err as { statusCode?: number }).statusCode === 409) {
      try {
        const existing = (await db.get(docId)) as { _id: string; _rev: string };
        logger.info(
          { docId, idempotencyKey: d.idempotencyKey },
          "Manuell-Anlage: Conflict-Race im INSERT — idempotent zurueckgegeben",
        );
        res.json({ ok: true, id: existing._id, rev: existing._rev, idempotent: true });
        return;
      } catch (getErr) {
        logger.error(
          { err: getErr, docId },
          "Manuell-Anlage: Conflict im INSERT aber Doc nicht auffindbar",
        );
        res.status(500).json({ error: "insert_conflict_no_doc" });
        return;
      }
    }
    throw err;
  }
}) as RequestHandler);

// ─── POST /api/einsaetze/:id/abschluss ─── FR-6 ─────────────
// Mannschaft-Rolle reicht — Solo-Tablet-Einsaetze (kein Florian, nur
// ein Fahrzeug) sollen auch direkt vom Fahrzeug-Tablet abgeschlossen
// werden koennen. Die Florianstation hat ohnehin die einsatzleiter-
// Rolle und kann das jederzeit zusaetzlich. Der abschlussOverride-
// Hinweis im PDF zeigt offene Fahrzeugberichte transparent.
//
// Issue 8 (Einsatz-Test 2026-06-02): Body-Felder verrechenbar + rechnungsadresse
// werden cascadiert auf alle Fahrzeugberichte uebernommen damit der
// Verrechnungs-Stand konsistent bleibt.
const AbschlussBodySchema = z.object({
  abschlussOverrideHinweis: z.string().optional(),
  verrechenbar: z.boolean().optional(),
  rechnungsadresse: z.string().optional(),
});
einsaetzeRouter.post("/api/einsaetze/:id/abschluss", requireAuth("mannschaft"), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const session = req.session!;
  const bodyParsed = AbschlussBodySchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    res.status(400).json({ error: "invalid_body", details: bodyParsed.error.flatten() });
    return;
  }
  const { verrechenbar, rechnungsadresse, abschlussOverrideHinweis: overrideHinweisFromBody } =
    bodyParsed.data;
  const doc = await getEinsatzOr404(id, res);
  if (!doc) return;
  if (doc.status === "abgeschlossen") {
    res.status(409).json({ error: "already_closed" });
    return;
  }
  // Abschluss-Override-Hinweis: wenn noch nicht alle Fahrzeugberichte
  // abgeschlossen sind aber der Einsatzleiter trotzdem abschliesst (z. B.
  // Kdt hat das Tablet noch nicht zurueckgegeben, Funktionaer braucht den
  // Bericht aber jetzt fuer syBOS), wandert ein Warn-Hinweis ins Doc. Das
  // PDF rendert ihn als rote Banner-Zeile damit der Bearbeiter sieht dass
  // ein oder mehrere Fahrzeugberichte ggf. nicht final waren.
  const fzgPrefix = `fzgber:${id.replace(/^einsatz:/, "")}:`;
  const fzgList = await db.list({
    startkey: fzgPrefix,
    endkey: `${fzgPrefix}￰`,
    include_docs: true,
  });
  const fzgDocs = fzgList.rows
    .map((r) => r.doc)
    .filter((d): d is NonNullable<typeof d> => !!d);
  const offeneFzgber = fzgDocs.filter(
    (f) => (f as { status?: string }).status === "in_arbeit",
  );
  const abschlussOverrideHinweis = offeneFzgber.length
    ? `Beim Abschluss waren ${offeneFzgber.length} Fahrzeugbericht(e) noch nicht abgeschlossen (${offeneFzgber
        .map((f) => (f as { fahrzeugId?: string }).fahrzeugId ?? "?")
        .join(", ")}). Datenstand entspricht dem Zwischenstand zum Abschluss-Zeitpunkt.`
    : undefined;
  // Issue 22 (Einsatz-Test 2026-06-02): Ölbindemittel-Säcke aus allen
  // Fahrzeugberichten aggregieren und ans Einsatz-Doc schreiben. Vorher
  // stand im Hauptbericht 0 Säcke, obwohl die Fahrzeuge in Summe 3 Säcke
  // verbraucht hatten. PDF-Renderer hat den Aggregations-Wert nicht.
  // Wir setzen oelbindemittel.gesamtSaecke beim Abschluss damit der Wert
  // dauerhaft persistiert ist (auch fuer spaetere Re-Renders).
  const oelGesamtSaecke = fzgDocs.reduce((sum, f) => {
    const n = (f as { oelbindemittelSaecke?: unknown }).oelbindemittelSaecke;
    return sum + (typeof n === "number" && n > 0 ? n : 0);
  }, 0);
  const oelbindemittelAggregiert = {
    verwendet: oelGesamtSaecke > 0,
    gesamtSaecke: oelGesamtSaecke,
  };
  // Issue 8: Verrechnung-Cascade. Wenn `verrechenbar` aus dem Body kommt,
  // setzen wir ihn auf das Einsatz-Doc + auf alle Fahrzeugberichte (siehe
  // Cascade-Loop unten). Optional auch die Rechnungsadresse.
  const existingVerrechnung =
    (doc as { verrechnung?: { verrechenbar?: boolean; rechnungsadresse?: string } })
      .verrechnung ?? {};
  const verrechnungUpdated =
    verrechenbar !== undefined || rechnungsadresse !== undefined
      ? {
          ...existingVerrechnung,
          ...(verrechenbar !== undefined ? { verrechenbar } : {}),
          ...(rechnungsadresse !== undefined ? { rechnungsadresse } : {}),
        }
      : existingVerrechnung;
  // Override-Hinweis kommt entweder aus Body (Override-Flow) oder aus
  // der automatischen "offene Fahrzeugberichte"-Detection (siehe oben).
  const finalOverrideHinweis = overrideHinweisFromBody ?? abschlussOverrideHinweis;
  const updated = {
    ...doc,
    status: "abgeschlossen",
    schreibschutz: true,
    einsatzende: new Date().toISOString(),
    bearbeiterPersonId: doc.bearbeiterPersonId,
    oelbindemittel: oelbindemittelAggregiert,
    verrechnung: verrechnungUpdated,
    geaendertAm: new Date().toISOString(),
    ...(finalOverrideHinweis ? { abschlussOverrideHinweis: finalOverrideHinweis } : {}),
  };
  const result = await db.insert(updated);
  logger.info({ id, by: session.username }, "Einsatz abgeschlossen");

  // F3: Cascade-Abschluss aller noch offenen Fahrzeugberichte.
  // Hintergrund: wenn der Einsatzleiter den Hauptauftrag schließt, sollen
  // KEINE in-arbeit Fahrzeugberichte mehr offen sein — die Tab-Kachel bleibt
  // sonst auf dem Fahrzeug-Tablet ewig hängen ("Geist-Tab"). Wir markieren
  // die als auto-abgeschlossen damit das PDF die Information trägt:
  // "Vom EL beim Hauptauftrag-Abschluss automatisch geschlossen".
  //
  // Issue 8 (Einsatz-Test 2026-06-02): Verrechnung wird ZUSAETZLICH auf
  // ALLE Fahrzeugberichte gespiegelt (auch die schon abgeschlossenen),
  // nicht nur die offenen. So bleibt der Verrechnungs-Stand konsistent.
  if (verrechenbar !== undefined || rechnungsadresse !== undefined) {
    const verrechnungCascadeNow = new Date().toISOString();
    const allFzgWithVerrechnung = fzgDocs.map((f) => ({
      ...(f as Record<string, unknown>),
      verrechnung: {
        ...((f as { verrechnung?: object }).verrechnung ?? {}),
        ...(verrechenbar !== undefined ? { verrechenbar } : {}),
        ...(rechnungsadresse !== undefined ? { rechnungsadresse } : {}),
      },
      geaendertAm: verrechnungCascadeNow,
    }));
    try {
      await bulkUpdateWithRetry(allFzgWithVerrechnung, logger);
      logger.info(
        { id, cascadeCount: allFzgWithVerrechnung.length, verrechenbar, rechnungsadresse },
        "Verrechnungs-Cascade auf alle Fahrzeugberichte",
      );
    } catch (err) {
      logger.warn(
        { err, id },
        "Verrechnungs-Cascade fehlgeschlagen — Hauptauftrag bleibt geschlossen",
      );
    }
  }
  if (offeneFzgber.length > 0) {
    const cascadeNow = new Date().toISOString();
    const cascadeDocs = offeneFzgber.map((f) => ({
      ...(f as Record<string, unknown>),
      status: "abgeschlossen" as const,
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: cascadeNow,
      autoAbgeschlossenGrund: "hauptauftrag-geschlossen" as const,
      geaendertAm: cascadeNow,
    }));
    try {
      const { ok, failed } = await bulkUpdateWithRetry(cascadeDocs, logger);
      logger.info(
        {
          id,
          cascadeCount: cascadeDocs.length,
          ok,
          failed: failed.length,
          failedIds: failed,
        },
        "Offene Fahrzeugberichte beim Hauptauftrag-Abschluss kaskadiert geschlossen",
      );
      if (failed.length > 0) {
        // Marker am Hauptauftrag — wir holen die frischeste _rev (wir haben
        // soeben den Hauptauftrag selbst gespeichert) und haengen das
        // Bookkeeping dran. So weiss ein spaeterer manueller Aufraeumer
        // welche Einsaetze noch verwaiste in_arbeit-Berichte tragen.
        try {
          const fresh = (await db.get(id)) as Record<string, unknown>;
          await db.insert({
            ...fresh,
            cascade_failed: true,
            cascade_failed_ids: failed,
            geaendertAm: new Date().toISOString(),
          } as Parameters<typeof db.insert>[0]);
        } catch (markErr) {
          logger.warn(
            { err: markErr, id },
            "cascade_failed-Marker konnte nicht gesetzt werden",
          );
        }
      }
    } catch (err) {
      // Kaskade-Fehler darf den Haupt-Abschluss nicht stoppen. Der
      // abschlussOverrideHinweis ist im Einsatz schon vermerkt.
      logger.warn(
        { err, id, count: cascadeDocs.length },
        "Cascade-Abschluss der Fahrzeugberichte fehlgeschlagen — Hauptauftrag bleibt geschlossen",
      );
    }
  }
  // Audit-Trail (Spec §17.1) — Pflicht-Ereignis. Schreib-Fehler werden im
  // Audit-Service geschluckt, damit der User-flow nicht blockiert wird.
  await writeAuditEvent({
    type: "einsatz-abschluss",
    actorUsername: session.username,
    actorRolle: session.rolle,
    einsatzId: id,
    ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json({ ok: true, id, rev: result.rev });
}) as RequestHandler);

// ─── POST /api/einsaetze/:id/verwerfen ──────────────────────
// "Schließen ohne Speichern" — der Bericht wird abgeschlossen, aber mit
// `verworfen: true` markiert. Das PDF zeigt eine "VERWORFEN"-Banner-Zeile,
// der Phantom-Cleanup räumt es bei Bedarf auf, und das Archiv kann
// nach verworfenen Einträgen filtern. Cascade-schließt offene
// Fahrzeugberichte mit autoAbgeschlossenGrund="hauptauftrag-verworfen".
const VerwerfenBodySchema = z.object({
  grund: z.string().min(3).optional(),
});

einsaetzeRouter.post(
  "/api/einsaetze/:id/verwerfen",
  requireAuth("mannschaft"),
  (async (req, res) => {
    const id = decodeURIComponent(String(req.params.id));
    const parsed = VerwerfenBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const session = req.session!;
    const doc = await getEinsatzOr404(id, res);
    if (!doc) return;
    if (doc.status === "abgeschlossen") {
      res.status(409).json({ error: "already_closed" });
      return;
    }
    const now = new Date().toISOString();
    const updated = {
      ...doc,
      status: "abgeschlossen",
      schreibschutz: true,
      verworfen: true,
      einsatzende: now,
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: now,
      autoAbgeschlossenGrund: "vom-user-verworfen" as const,
      ...(parsed.data.grund ? { verwerfungsGrund: parsed.data.grund } : {}),
      abschlussOverrideHinweis: parsed.data.grund
        ? `Bericht ohne Speichern verworfen — Grund: ${parsed.data.grund}`
        : "Bericht ohne Speichern verworfen.",
      geaendertAm: now,
    };
    const result = await db.insert(updated);

    // Cascade: offene Fahrzeugberichte mit verwerfen-Marker schließen
    const fzgPrefix = `fzgber:${id.replace(/^einsatz:/, "")}:`;
    const fzgList = await db.list({
      startkey: fzgPrefix,
      endkey: `${fzgPrefix}￰`,
      include_docs: true,
    });
    const offeneFzg = fzgList.rows
      .map((r) => r.doc)
      .filter((d): d is NonNullable<typeof d> => !!d)
      .filter((d) => (d as { status?: string }).status === "in_arbeit");
    if (offeneFzg.length > 0) {
      const cascade = offeneFzg.map((f) => ({
        ...(f as Record<string, unknown>),
        status: "abgeschlossen" as const,
        verworfen: true,
        autoAbgeschlossen: true,
        autoAbgeschlossenAm: now,
        autoAbgeschlossenGrund: "hauptauftrag-verworfen" as const,
        geaendertAm: now,
      }));
      try {
        const { ok, failed } = await bulkUpdateWithRetry(cascade, logger);
        logger.info(
          { id, cascadeCount: cascade.length, ok, failed: failed.length, failedIds: failed },
          "Cascade-Verwerfen ausgefuehrt",
        );
        if (failed.length > 0) {
          try {
            const fresh = (await db.get(id)) as Record<string, unknown>;
            await db.insert({
              ...fresh,
              cascade_failed: true,
              cascade_failed_ids: failed,
              geaendertAm: new Date().toISOString(),
            } as Parameters<typeof db.insert>[0]);
          } catch (markErr) {
            logger.warn(
              { err: markErr, id },
              "cascade_failed-Marker (verwerfen) konnte nicht gesetzt werden",
            );
          }
        }
      } catch (err) {
        logger.warn({ err, id, count: cascade.length }, "Cascade-Verwerfen fehlgeschlagen");
      }
    }

    logger.warn(
      { id, by: session.username, grund: parsed.data.grund },
      "Einsatz VERWORFEN (Schließen ohne Speichern)",
    );
    await writeAuditEvent({
      type: "einsatz-abschluss",
      actorUsername: session.username,
      actorRolle: session.rolle,
      einsatzId: id,
      ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
      details: {
        grund: parsed.data.grund ?? "vom-user-verworfen",
        verworfen: true,
      },
    });
    res.json({ ok: true, id, rev: result.rev, verworfen: true });
  }) as RequestHandler,
);

// ─── POST /api/einsaetze/:id/reaktivieren ─── FR-14 ─────────
const ReaktivierenBodySchema = z.object({
  grund: z.string().min(10, "Reaktivierungs-Grund mind. 10 Zeichen"),
});

einsaetzeRouter.post(
  "/api/einsaetze/:id/reaktivieren",
  // Issue 10 (Einsatz-Test 2026-06-02): Mannschaft darf auch reaktivieren
  // damit das Fahrzeug-Tablet einen unabsichtlich abgeschlossenen Bericht
  // selbst wieder oeffnen kann. Vorher musste die Florianstation gerufen
  // werden ("PIN 1234"), was im Live-Einsatz unpraktisch war.
  // Der Audit-Trail (Pflicht-Begruendung min. 10 Zeichen + Audit-Event)
  // bleibt unveraendert, sodass die Reaktivierung weiterhin nachvollziehbar
  // ist.
  requireAuth("mannschaft"),
  (async (req, res) => {
    const id = decodeURIComponent(String(req.params.id));
    const parsed = ReaktivierenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const session = req.session!;
    const doc = await getEinsatzOr404(id, res);
    if (!doc) return;
    if (doc.status !== "abgeschlossen") {
      res.status(409).json({ error: "not_closed" });
      return;
    }
    const reaktivierungen = (doc.reaktivierungen as unknown[] | undefined) ?? [];
    const updated = {
      ...doc,
      status: "aktiv",
      schreibschutz: false,
      reaktivierungen: [
        ...reaktivierungen,
        {
          vonBenutzerId: session.sub,
          am: new Date().toISOString(),
          grund: parsed.data.grund,
          vonStatus: "abgeschlossen",
        },
      ],
      geaendertAm: new Date().toISOString(),
    };
    const result = await db.insert(updated);
    logger.warn(
      { id, by: session.username, grund: parsed.data.grund },
      "Einsatz REAKTIVIERT — Audit-Trail aktualisiert",
    );
    // Audit-Trail (Spec §17.1) — Reaktivierungen MÜSSEN nachvollziehbar sein.
    // Pflicht-Begründung wird im `details`-Feld mitgeschrieben.
    await writeAuditEvent({
      type: "einsatz-reaktivierung",
      actorUsername: session.username,
      actorRolle: session.rolle,
      einsatzId: id,
      ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
      details: { grund: parsed.data.grund },
    });
    res.json({ ok: true, id, rev: result.rev });
  }) as RequestHandler,
);

// ─── DELETE /api/einsaetze/:id ─── Issue 2 (Einsatz-Test 2026-06-02) ───
// Endgueltiges Loeschen eines Einsatzes + Cascade auf alle
// Fahrzeugberichte. Anwendungsfall: Test-Eintraege aus dem realen
// Test-Sprint, fehlerhafte Doppel-Anlagen, oder ein Einsatz der
// versehentlich angelegt wurde.
//
// Sicherheits-Modell:
//   - Pflicht-Begruendung (min. 10 Zeichen) damit der Audit-Trail nachvoll-
//     ziehbar bleibt
//   - Rolle "einsatzleiter" damit nicht jedes Fahrzeug-Tablet loeschen kann
//   - CouchDB soft-Delete via `_deleted: true` + `geaendertAm`, das Doc
//     bleibt mit Tombstone in der Datenbank — der Audit-Service kann es
//     nachweisen (Compliance), aber kein normaler Read findet es mehr.
//   - Cascade-Loeschung aller fzgber:<einsatzId>:* via bulk-delete
const DeleteEinsatzBodySchema = z.object({
  grund: z.string().min(10, "Loesch-Grund mind. 10 Zeichen"),
});

einsaetzeRouter.delete(
  "/api/einsaetze/:id",
  requireAuth("einsatzleiter"),
  (async (req, res) => {
    const id = decodeURIComponent(String(req.params.id));
    const parsed = DeleteEinsatzBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const session = req.session!;
    const doc = await getEinsatzOr404(id, res);
    if (!doc) return;

    // Cascade-Loeschung aller Fahrzeugberichte. Wir holen sie zuerst,
    // markieren mit _deleted=true und schicken im bulk insert.
    const fzgPrefix = `fzgber:${id.replace(/^einsatz:/, "")}:`;
    const fzgList = await db.list({
      startkey: fzgPrefix,
      endkey: `${fzgPrefix}￰`,
      include_docs: true,
    });
    const fzgDocs = fzgList.rows
      .map((r) => r.doc)
      .filter((d): d is NonNullable<typeof d> => !!d);

    const cascadeIds = fzgDocs.map((f) => (f as { _id?: string })._id ?? "?");

    // Bulk-Delete: alle Fahrzeugberichte + Einsatz selbst in einer
    // bulk_docs-Operation. So bleibt das Loeschen atomar im
    // Concurrency-Sinne (gleiche Update-Sequence).
    const bulkDocs: Array<Record<string, unknown>> = [
      ...fzgDocs.map((f) => ({ ...(f as Record<string, unknown>), _deleted: true })),
      { ...doc, _deleted: true },
    ];
    // RISIKO-6 (Audit 2026-06-03): Frueher wurde db.bulk hier ohne Auswertung
    // des Rueckgabe-Arrays aufgerufen. Bei einem Per-Doc-Konflikt (1 von N
    // fzgber hatte eine stale _rev) blieb dieses Doc als verwaister
    // Orphan zurueck, die Response meldete trotzdem `ok`. Wir nutzen jetzt
    // bulkUpdateWithRetry: das wertet pro Doc den CouchDB-Status aus, holt bei
    // `error: "conflict"` die frische _rev per db.get und versucht den
    // Tombstone-Insert (_deleted:true bleibt im sourceDoc → valider
    // CouchDB-Delete) genau 1x erneut. IDs die auch nach dem Retry
    // fehlschlagen landen transparent in `failed` und damit in der Response
    // (`cascade_failed`) + im Audit-Event, statt still verschluckt zu werden.
    let failed: string[];
    try {
      ({ failed } = await bulkUpdateWithRetry(bulkDocs, logger));
    } catch (err) {
      logger.error(
        { err, id, count: bulkDocs.length },
        "Loeschen des Einsatzes fehlgeschlagen — Tombstones nicht gesetzt",
      );
      res.status(500).json({ error: "delete_failed", message: String(err) });
      return;
    }

    logger.warn(
      {
        id,
        by: session.username,
        grund: parsed.data.grund,
        fzgCount: cascadeIds.length,
        ...(failed.length > 0 ? { cascade_failed: failed } : {}),
      },
      failed.length > 0
        ? "Einsatz geloescht — aber einzelne Cascade-Docs blieben nach Retry als Orphan zurueck"
        : "Einsatz GELOESCHT — Cascade auf Fahrzeugberichte",
    );
    await writeAuditEvent({
      type: "einsatz-delete",
      actorUsername: session.username,
      actorRolle: session.rolle,
      einsatzId: id,
      ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
      details: {
        grund: parsed.data.grund,
        cascade_fzgber: cascadeIds,
        ...(failed.length > 0 ? { cascade_failed: failed } : {}),
      },
    });
    res.json({
      ok: true,
      id,
      deleted: true,
      cascade_fzgber: cascadeIds.length,
      ...(failed.length > 0 ? { cascade_failed: failed } : {}),
    });
  }) as RequestHandler,
);

// ─── PUT /api/einsaetze/:id ─── Allg. Update (mit Schreibschutz-Check) ─
/**
 * Allowlist der Felder die ueber das generische PUT bearbeitbar sind.
 * Alles andere (Identitaet, Status, Audit-Marker, Lifecycle-Flags) wird
 * stillschweigend gefiltert — die Routes /abschluss, /verwerfen,
 * /reaktivieren und der Anlage-Endpunkt sind die einzigen Stellen, die
 * Status/schreibschutz/einsatzende/usw. setzen duerfen.
 *
 * Aufgenommen sind genau die Felder die Florian-Editor (ZentralePage) und
 * die manuelle Bearbeitung effektiv schreiben — siehe Frontend-Audit.
 */
const PUT_EINSATZ_ALLOWED_FIELDS = new Set<string>([
  "einsatzort",
  "einsatzart",
  "einsatzartFreitext",
  "einsatzartTyp",
  "meldungEinsatzleitung",
  "pflichtbereich",
  "einsatzzoneEzell",
  "ueberOertlicheHilfe",
  "ueberortlicheHilfe", // legacy alias
  "alarmiertDurch",
  "beteiligteStellen",
  "sonstigeAnwesendeFF",
  "mannschaft",
  "verrechnung",
  "oelbindemittel",
  "zeitmarken",
  "abschlussOverrideHinweis",
  "bearbeiterPersonId",
  "einsatzleiterPersonId",
  "reservePersonIds",
  "zugewieseneFahrzeuge",
  "lotsendienstAuftraggeber",
  "lotsendienstRoute",
  "uebungThema",
  "uebungsleiter",
  "uebungsTyp",
  "anrufer",
  "anruferTel",
  "einsatzauftragVia",
  "vidi", // wildcard prefix — siehe Loop unten
  "fahrzeugPositionen",
  "chronik",
  // Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik-Block.
  "technischeStatistik",
  // Issue 17 (Einsatz-Test 2026-06-02): syBOS Brand-Statistik-Block (vom
  // BrandAbschlussWizard via PUT geschrieben kurz vor dem /abschluss-Call).
  "brandStatistik",
]);

// Issue 7 (Einsatz-Test 2026-06-02): von einsatzleiter auf mannschaft
// gelockert damit das Fahrzeug-Tablet die Einsatzadresse korrigieren kann
// (z. B. wenn BlaulichtSMS-Geocoder daneben liegt). Die Field-Allowlist
// (PUT_EINSATZ_ALLOWED_FIELDS) und der Schreibschutz-Check sind die
// eigentlichen Schutzmechanismen; die Rolle filtert nur ob ueberhaupt
// jemand schreiben darf (jeder Aufgaben-Mitarbeiter ja, nur Read-only
// Backoffice-User nein).
einsaetzeRouter.put("/api/einsaetze/:id", requireAuth("mannschaft"), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const current = await getEinsatzOr404(id, res);
  if (!current) return;
  if (current.schreibschutz === true) {
    res.status(423).json({ error: "schreibschutz_aktiv", hint: "Bericht muss erst reaktiviert werden (FR-14)." });
    return;
  }
  // Field-Allowlist: nur whitelisted Keys aus dem Body uebernehmen.
  // Schuetzt vor Privilege-Escalation via PUT (Status reset, schreibschutz
  // umgehen, Audit-Felder manipulieren). Felder mit "vidi"-Prefix sind
  // erlaubt damit der Florian-Editor Vidierungs-Workflows pflegen kann.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const safeBody: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (PUT_EINSATZ_ALLOWED_FIELDS.has(key) || key.startsWith("vidi")) {
      safeBody[key] = body[key];
    }
  }
  const merged = {
    ...current,
    ...safeBody,
    _id: current._id,
    _rev: current._rev,
    type: "einsatz",
    geaendertAm: new Date().toISOString(),
  };
  const validated = EinsatzSchema.safeParse(merged);
  if (!validated.success) {
    res.status(400).json({ error: "schema_invalid", details: validated.error.flatten() });
    return;
  }
  // RISIKO-4 (Audit 2026-06-03): Dieses generische PUT war der EINZIGE
  // Schreibpfad ohne 409-Conflict-Retry → Lost-Update bei parallelen
  // Florian-Editor-Autosaves. Wir kapseln den Insert in denselben
  // Retry-on-409-Mechanismus wie der Fahrzeugbericht-PUT (siehe
  // "PUT fzgber: 409 Conflict" weiter unten). Bei 409 holen wir die frische
  // _rev per db.get(id), re-mergen current-Server-Stand + safeBody (safeBody
  // ist die User-Aenderung, fresh der frische Server-Stand → korrekt) und
  // validieren erneut, bevor wir genau 1x neu inserten. Die
  // Allowlist-Filterung (safeBody) + Schema-Validierung bleiben so auch im
  // Retry-Pfad erhalten. Schlaegt der Retry erneut mit 409 fehl → 409
  // conflict_retry_failed an den Client.
  let result: Awaited<ReturnType<typeof db.insert>>;
  try {
    result = await db.insert(merged);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 409) throw err;
    logger.info({ id }, "PUT einsatz: 409 Conflict — Retry mit frischer _rev");
    const fresh = await getEinsatzOr404(id, res);
    if (!fresh) return;
    const retryMerged = {
      ...fresh,
      ...safeBody,
      _id: fresh._id,
      _rev: fresh._rev,
      type: "einsatz",
      geaendertAm: new Date().toISOString(),
    };
    const retryValidated = EinsatzSchema.safeParse(retryMerged);
    if (!retryValidated.success) {
      res
        .status(400)
        .json({ error: "schema_invalid", details: retryValidated.error.flatten() });
      return;
    }
    try {
      result = await db.insert(retryMerged);
    } catch (retryErr) {
      if ((retryErr as { statusCode?: number }).statusCode === 409) {
        logger.warn({ id }, "PUT einsatz: Retry erneut 409 — conflict_retry_failed");
        res.status(409).json({
          error: "conflict_retry_failed",
          hint: "Einsatz wurde zwischenzeitlich von anderer Seite geaendert. Bitte erneut laden und nochmal speichern.",
        });
        return;
      }
      throw retryErr;
    }
  }
  // Audit-Trail: wenn sich die Fahrzeug-Zuweisung geaendert hat → eigenes
  // Event schreiben. Sicherheits-relevant: aendert die Sichtbarkeit eines
  // Einsatzes auf den Fahrzeug-Tablets.
  // sortiert vergleichen — Reihenfolge im Array sollte den Audit-Trail
  // nicht ausloesen (logisch eine Menge, nicht eine Liste).
  const arrAsString = (raw: unknown): string => {
    const arr = Array.isArray(raw) ? [...(raw as string[])] : [];
    arr.sort();
    return JSON.stringify(arr);
  };
  const vorher = arrAsString(
    (current as { zugewieseneFahrzeuge?: string[] }).zugewieseneFahrzeuge,
  );
  const nachher = arrAsString(
    (merged as { zugewieseneFahrzeuge?: string[] }).zugewieseneFahrzeuge,
  );
  if (vorher !== nachher) {
    const session = req.session;
    await writeAuditEvent({
      type: "einsatz-zuweisung-geaendert",
      ...(session?.username ? { actorUsername: session.username } : {}),
      ...(session?.rolle ? { actorRolle: session.rolle } : {}),
      einsatzId: id,
      details: {
        vorher: (current as { zugewieseneFahrzeuge?: string[] }).zugewieseneFahrzeuge ?? [],
        nachher: (merged as { zugewieseneFahrzeuge?: string[] }).zugewieseneFahrzeuge ?? [],
      },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
  }
  res.json({ ok: true, id, rev: result.rev });
}) as RequestHandler);

// ─── PUT /api/einsaetze/:id/fahrzeugbericht/:fzgId ─────────────
einsaetzeRouter.put(
  "/api/einsaetze/:id/fahrzeugbericht/:fzgId",
  requireAuth(),
  (async (req, res) => {
    const einsatzId = decodeURIComponent(String(req.params.id));
    const fahrzeugId = decodeURIComponent(String(req.params.fzgId));
    const docId = `fzgber:${einsatzId.replace(/^einsatz:/, "")}:${fahrzeugId}`;

    // Schreibschutz-Check via Einsatz
    const einsatz = (await db.get(einsatzId).catch(() => null)) as Record<string, unknown> | null;
    if (!einsatz) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    if (einsatz.schreibschutz === true) {
      res.status(423).json({ error: "schreibschutz_aktiv" });
      return;
    }

    let existing: Record<string, unknown> | null = null;
    try {
      existing = (await db.get(docId)) as Record<string, unknown>;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }

    const now = new Date().toISOString();
    const merged = {
      ...(existing ?? {
        type: "fahrzeugbericht" as const,
        einsatzId,
        fahrzeugId,
        zeit: {},
        km: { gefahrenKm: 0 },
        gpsTrack: [],
        mannschaft: [],
        geraete: [],
        oelbindemittelSaecke: 0,
        taetigkeitsbericht: "",
        status: "in_arbeit" as const,
        erstelltAm: now,
      }),
      ...req.body,
      _id: docId,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      type: "fahrzeugbericht" as const,
      einsatzId,
      fahrzeugId,
      geaendertAm: now,
    };
    const validated = FahrzeugberichtSchema.safeParse(merged);
    if (!validated.success) {
      res.status(400).json({ error: "schema_invalid", details: validated.error.flatten() });
      return;
    }
    // F-36: Retry-on-Conflict. CouchDB liefert 409 wenn zwischen unserem
    // get(existing) oben und dem insert hier ein anderer Client (z.B.
    // zweiter Tab am selben Fahrzeug-Tablet, paralleler Auto-Save) schon
    // eine neue _rev geschrieben hat. Wir holen die frische _rev, mergen
    // erneut und versuchen einmal nach. Wenn auch das fehlschlaegt, geben
    // wir 409 zurueck — der Client kennt dann den Konflikt und kann den
    // User informieren.
    try {
      const result = await db.insert(merged);
      res.json({ ok: true, id: docId, rev: result.rev });
      return;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) throw err;
      logger.info(
        { docId },
        "PUT fzgber: 409 Conflict — Retry mit frischer _rev",
      );
      try {
        const fresh = (await db.get(docId)) as Record<string, unknown>;
        const retryMerged = {
          ...merged,
          _rev: fresh._rev,
        };
        const result = await db.insert(retryMerged);
        res.json({ ok: true, id: docId, rev: result.rev, retried: true });
        return;
      } catch (retryErr) {
        if ((retryErr as { statusCode?: number }).statusCode === 409) {
          logger.warn(
            { docId },
            "PUT fzgber: Retry erneut 409 — conflict_retry_failed",
          );
          res.status(409).json({
            error: "conflict_retry_failed",
            hint: "Bericht wurde zwischenzeitlich von anderer Seite geaendert. Bitte erneut laden und nochmal speichern.",
          });
          return;
        }
        throw retryErr;
      }
    }
  }) as RequestHandler,
);

// ─── POST /api/einsaetze/:id/chronik ──────────────────────────
// Append-only Endpoint für Einsatzchronik. Wird von jedem Fahrzeug-
// Tablet aufgerufen wenn ein Diktat / Auftrag / Status-Event eintritt.
// Idempotent über entry.id — wenn der Eintrag schon vorhanden ist,
// 200 OK ohne erneutes Insert (verhindert Duplikate bei Retry/Sync).
// Tablets pollen GET .../chronik in 8s-Intervallen und mergen
// Einträge ihrer Geschwister-Fahrzeuge → echter Cross-Check.
const ChronikEintragBodySchema = z.object({
  id: z.string().min(1),
  zeitstempel: z.string(),
  funkrufname: z.string().min(1),
  fahrzeugId: z.string().min(1),
  source: z.enum(["blaulichtsms", "fahrzeug", "manuell", "atemschutz"]),
  text: z.string().min(1).max(2000),
  pending: z.boolean().optional(),
  transkriptStatus: z.enum(["pending", "verfuegbar", "fehlgeschlagen"]).optional(),
  // Foto-Funktion (2026-06-03): Referenz aufs foto:-Doc (falls Foto-Eintrag).
  fotoId: z.string().optional(),
});

einsaetzeRouter.post("/api/einsaetze/:id/chronik", requireAuth(), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const parsed = ChronikEintragBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  let doc: Record<string, unknown>;
  try {
    doc = (await db.get(id)) as Record<string, unknown>;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    throw err;
  }
  if (doc.schreibschutz === true) {
    // 423 = Locked. Hint-Feld traegt eine User-lesbare Erlaeuterung damit
    // das Frontend (Tablet/Florianstation) einen verstaendlichen Toast
    // anzeigen kann anstatt den nackten Error-Code.
    res.status(423).json({
      error: "schreibschutz_aktiv",
      hint: "Bericht ist abgeschlossen - bitte zuerst reaktivieren",
    });
    return;
  }

  const chronik = ((doc.chronik as unknown[] | undefined) ?? []) as Array<{ id: string }>;
  // F-42 (S3 niedrig): linearer Scan O(n). Bei <100 Eintraegen pro Einsatz
  // vernachlaessigbar; bei deutlich groesseren Chroniken (Langzeiteinsatz)
  // koennte man einen Set<string> ueber ids bauen. Skip bis Bedarf besteht.
  const exists = chronik.find((e) => e.id === parsed.data.id);
  if (exists) {
    // Idempotent — Eintrag schon vorhanden
    res.json({ ok: true, deduped: true, total: chronik.length });
    return;
  }

  const updated = {
    ...doc,
    chronik: [...chronik, parsed.data],
    geaendertAm: new Date().toISOString(),
  };
  const result = await db.insert(updated);
  logger.info(
    { id, source: parsed.data.source, fzg: parsed.data.fahrzeugId },
    "Chronik-Eintrag broadcast",
  );
  res.json({ ok: true, rev: result.rev, total: chronik.length + 1 });
}) as RequestHandler);

// ─── PUT /api/einsaetze/:id/chronik/:entryId ─────────────────
// Issue 6 (Einsatz-Test 2026-06-02): Chronik-Eintraege editierbar.
// Bei Web-Speech-Diktat verschluckt der Browser-Recognizer manchmal
// Wortteile ("Floriane Berstalzell" statt "Florian Eberstalzell") oder
// erkennt Fahrzeug-Abk. falsch ("Tee-El-Eff" statt "TLF"). Der Kdt soll
// am Tablet direkt korrigieren koennen, ohne den ganzen Eintrag neu
// diktieren zu muessen. Florianstation darf alle Eintraege bearbeiten
// (zentrales Lektorat). Audit-Event "chronik-edit" + editiertAm/editiertVon
// im Eintrag selbst machen den Vorgang nachvollziehbar.
const ChronikEditBodySchema = z.object({
  text: z.string().min(1).max(2000),
});
einsaetzeRouter.put(
  "/api/einsaetze/:id/chronik/:entryId",
  requireAuth("mannschaft"),
  (async (req, res) => {
    const id = decodeURIComponent(String(req.params.id));
    const entryId = decodeURIComponent(String(req.params.entryId));
    const parsed = ChronikEditBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const session = req.session!;
    const doc = await getEinsatzOr404(id, res);
    if (!doc) return;
    if (doc.schreibschutz === true) {
      // 423 Locked — selber Code wie POST /chronik damit das Frontend
      // einheitlich reagiert (Reaktivierung-Hinweis im Toast).
      res.status(423).json({
        error: "schreibschutz_aktiv",
        hint: "Bericht ist abgeschlossen - bitte zuerst reaktivieren",
      });
      return;
    }
    const chronik = ((doc.chronik as unknown[] | undefined) ?? []) as Array<
      Record<string, unknown>
    >;
    const idx = chronik.findIndex(
      (e) => (e as { id?: string }).id === entryId,
    );
    if (idx < 0) {
      res.status(404).json({ error: "entry_not_found" });
      return;
    }
    const now = new Date().toISOString();
    const updatedEntry = {
      ...chronik[idx],
      text: parsed.data.text,
      editiertAm: now,
      editiertVon: session.username,
    };
    const nextChronik = [...chronik];
    nextChronik[idx] = updatedEntry;
    const updated = {
      ...doc,
      chronik: nextChronik,
      geaendertAm: now,
    } as Record<string, unknown>;
    // F-36-Parallele: PUT-Konflikt-Retry via bulkUpdateWithRetry. Bei
    // 8s-Polling + Florianstation + bis zu 4 Fahrzeugen ist ein Conflict
    // realistisch wenn zwei Editoren gleichzeitig denselben Einsatz
    // schreiben. bulkUpdateWithRetry holt frische _rev und retried einmal.
    const { ok, failed } = await bulkUpdateWithRetry([updated], logger);
    if (failed.length > 0 || ok === 0) {
      res.status(409).json({
        error: "conflict_retry_failed",
        hint: "Eintrag wurde zwischenzeitlich geaendert. Bitte erneut versuchen.",
      });
      return;
    }
    logger.info(
      { id, entryId, by: session.username },
      "Chronik-Eintrag editiert",
    );
    await writeAuditEvent({
      type: "chronik-edit",
      actorUsername: session.username,
      actorRolle: session.rolle,
      einsatzId: id,
      ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
      details: { entryId },
    });
    res.json({ ok: true, id, entryId, total: nextChronik.length });
  }) as RequestHandler,
);

// ─── GET /api/einsaetze/:id/chronik ───────────────────────────
// Liefert nur die chronik-Sub-Liste. Tablets pollen das alle 8s und
// vergleichen mit ihrem lokalen Set — neue Einträge werden lokal
// angehängt, Duplikate über entry.id gefiltert.
einsaetzeRouter.get("/api/einsaetze/:id/chronik", requireAuth(), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  try {
    const doc = (await db.get(id)) as Record<string, unknown>;
    const chronik = (doc.chronik as unknown[] | undefined) ?? [];
    res.json({ ok: true, id, chronik, geaendertAm: doc.geaendertAm });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    throw err;
  }
}) as RequestHandler);

// ─── GET /api/einsaetze/:id/fahrzeugberichte ───────────────────
einsaetzeRouter.get(
  "/api/einsaetze/:id/fahrzeugberichte",
  requireAuth(),
  (async (req, res) => {
    const einsatzId = decodeURIComponent(String(req.params.id));
    const prefix = `fzgber:${einsatzId.replace(/^einsatz:/, "")}:`;
    const list = await db.list({
      startkey: prefix,
      endkey: `${prefix}￰`,
      include_docs: true,
    });
    const docs = list.rows
      .map((r) => r.doc)
      .filter((d): d is NonNullable<typeof d> => d !== undefined);
    res.json({ ok: true, items: docs });
  }) as RequestHandler,
);

// ─── GET /api/fahrzeugberichte/meine ───────────────────────────
// Liefert alle Fahrzeugberichte eines bestimmten Fahrzeugs zusammen mit
// den Einsatz-Stammdaten (Stichwort/Adresse/Datum) als zusammengefasste
// Items fuer das Tablet-Archiv. Default-Filter: status=abgeschlossen, damit
// nur fertig gearbeitete Berichte erscheinen. Sortierung nach Alarmzeit DESC.
einsaetzeRouter.get(
  "/api/fahrzeugberichte/meine",
  requireAuth(),
  (async (req, res) => {
    const fahrzeugId =
      typeof req.query.fahrzeugId === "string" ? req.query.fahrzeugId : "";
    if (!fahrzeugId) {
      res.status(400).json({ error: "fahrzeugId_required" });
      return;
    }
    const statusFilter =
      typeof req.query.status === "string" ? req.query.status : "abgeschlossen";
    const list = await db.list({
      startkey: "fzgber:",
      endkey: "fzgber:￰",
      include_docs: true,
    });
    const fzgbers = list.rows
      .map((r) => r.doc)
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .filter((d) => {
        const doc = d as { type?: string; fahrzeugId?: string; status?: string };
        if (doc.type !== "fahrzeugbericht") return false;
        if (doc.fahrzeugId !== fahrzeugId) return false;
        if (statusFilter !== "alle" && doc.status !== statusFilter) return false;
        return true;
      });
    const items: Array<{
      _id: string;
      einsatzId: string;
      einsatzart: string;
      einsatzartFreitext?: string;
      einsatzort?: string;
      alarmierungZeit?: string;
      einsatzTyp?: string;
      kmGefahrenKm: number;
      mannschaftAnzahl: number;
      status: string;
      geaendertAm?: string;
    }> = [];

    // F-45: N+1 eliminieren — statt pro fzgber ein db.get(einsatzId)
    // sequentiell, sammeln wir alle unique einsatzIds und holen sie in
    // einem einzigen db.fetch({keys}) Roundtrip. Mit 50 Fahrzeugberichten
    // sparen wir 49 HTTP-Calls an CouchDB.
    type EinsatzKopf = {
      _id?: string;
      einsatzart?: string;
      einsatzartFreitext?: string;
      einsatzort?: string;
      alarmierungZeit?: string;
      einsatzTyp?: string;
    };
    const einsatzIds = Array.from(
      new Set(
        fzgbers
          .map((d) => (d as { einsatzId?: string }).einsatzId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    const einsatzMap = new Map<string, EinsatzKopf>();
    if (einsatzIds.length > 0) {
      try {
        const bulk = (await db.fetch({ keys: einsatzIds })) as {
          rows: Array<{ id?: string; doc?: EinsatzKopf; error?: string }>;
        };
        for (const row of bulk.rows) {
          if (row.doc && row.id) {
            einsatzMap.set(row.id, row.doc);
          }
        }
      } catch (err) {
        // Bulk-Fetch fehlgeschlagen — wir liefern leere Map zurueck und
        // die Items kriegen nur die fzgber-eigenen Felder (kein Einsatz-
        // Stichwort/Adresse). Besser als kompletter 500.
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), count: einsatzIds.length },
          "fahrzeugberichte/meine: Bulk-Fetch der Einsaetze fehlgeschlagen",
        );
      }
    }

    for (const d of fzgbers) {
      const doc = d as {
        _id: string;
        einsatzId?: string;
        status?: string;
        geaendertAm?: string;
        km?: { gefahrenKm?: number };
        mannschaft?: unknown[];
      };
      if (!doc.einsatzId) continue;
      const einsatz = einsatzMap.get(doc.einsatzId);
      if (!einsatz) {
        // Einsatz-Doc weg → Fahrzeugbericht orphan, ignorieren (selbe
        // Semantik wie vorher der `catch`-Block).
        continue;
      }
      items.push({
        _id: doc._id,
        einsatzId: doc.einsatzId,
        einsatzart:
          einsatz.einsatzart ?? einsatz.einsatzartFreitext ?? "Einsatz",
        ...(einsatz.einsatzartFreitext
          ? { einsatzartFreitext: einsatz.einsatzartFreitext }
          : {}),
        ...(einsatz.einsatzort ? { einsatzort: einsatz.einsatzort } : {}),
        ...(einsatz.alarmierungZeit
          ? { alarmierungZeit: einsatz.alarmierungZeit }
          : {}),
        ...(einsatz.einsatzTyp ? { einsatzTyp: einsatz.einsatzTyp } : {}),
        kmGefahrenKm: doc.km?.gefahrenKm ?? 0,
        mannschaftAnzahl: Array.isArray(doc.mannschaft) ? doc.mannschaft.length : 0,
        status: doc.status ?? "unbekannt",
        ...(doc.geaendertAm ? { geaendertAm: doc.geaendertAm } : {}),
      });
    }
    items.sort((a, b) => {
      const ta = new Date(a.alarmierungZeit ?? 0).getTime();
      const tb = new Date(b.alarmierungZeit ?? 0).getTime();
      return tb - ta;
    });
    res.json({ ok: true, items });
  }) as RequestHandler,
);
