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
import { Router, type Response } from "express";
import { z } from "zod";
import { EINSATZ_POLL_FELDER, EinsatzSchema, FahrzeugberichtSchema } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { ah } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { writeAuditEvent } from "../services/audit.js";
import type { SessionPayload } from "../services/auth/jwt.js";
import { vergebeBerichtNummer } from "../services/bericht-nummer.js";

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
 * A-07 (Audit 2026-07): Der fruehere Retry inserte `{ ...sourceDoc,
 * _rev: fresh._rev }` — damit ueberschrieb unser STALER sourceDoc-Stand
 * alle Felder, die der parallele Writer gerade geaendert hatte
 * (Lost-Update). Mit `patchFor` liefert der Caller NUR seine Absichts-
 * Felder; im Conflict-Fall wird `{ ...fresh, ...patch }` inserted —
 * fremde Aenderungen bleiben erhalten. Gibt patchFor `null` zurueck
 * (Patch auf frischem Stand nicht mehr anwendbar), landet die ID in
 * `failed`. Ohne patchFor bleibt das alte Verhalten (Backwards-Compat).
 *
 * @returns ok = Anzahl erfolgreicher Updates inkl. Retries,
 *          failed = Liste der IDs die endgueltig fehlgeschlagen sind
 */
async function bulkUpdateWithRetry(
  docs: Array<Record<string, unknown>>,
  log: typeof logger,
  patchFor?: (
    docId: string,
    fresh: Record<string, unknown>,
  ) => Record<string, unknown> | null,
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
    // Retry-Pfad: CouchDB-Conflict — frischen Stand holen und nochmal
    // mit single-insert versuchen. Mit patchFor werden NUR die Absichts-
    // Felder auf den frischen Stand appliziert (kein Stale-Overwrite).
    try {
      const fresh = (await db.get(docId)) as Record<string, unknown>;
      let merged: Record<string, unknown>;
      if (patchFor) {
        const patch = patchFor(docId, fresh);
        if (patch === null) {
          failed.push(docId);
          log.warn(
            { id: docId },
            "bulkUpdateWithRetry: patchFor nicht anwendbar — Doc bleibt im frischen Zustand",
          );
          continue;
        }
        merged = { ...fresh, ...patch };
      } else {
        merged = { ...sourceDoc, _rev: fresh._rev };
      }
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

// A-03a (Audit 2026-07): In-Memory-TTL-Cache fuer den einsatz:-Voll-Scan.
// GET /api/einsaetze ist der heisseste Pfad (Fahrzeug-Tablets pollen alle
// 5 s, dazu Florian + Lagekarte) — alle Poller teilen sich damit EINEN
// CouchDB-Read pro TTL-Fenster. Jeder erfolgreiche Schreib-Endpunkt auf
// Einsaetze ruft invalidateEinsatzCache(), damit eigene Aenderungen ohne
// Verzoegerung sichtbar sind; die TTL deckt nur den Poll-Traffic ab.
const EINSATZ_LIST_CACHE_TTL_MS = 2500;
let einsatzListCache: {
  at: number;
  list: Awaited<ReturnType<typeof db.list>>;
} | null = null;

// C-07 (Audit R3): Der status=aktiv-Pfad (5-s-Tablet-Poll, Florian, Lage-
// karte) laeuft ueber eine Mango-Query auf den Index type-status
// (couch/client.ts:ensureMangoIndizes) statt ueber den einsatz:-Vollscan —
// die Antwortzeit haengt damit nicht mehr an der Archivgroesse (aktive
// Einsaetze sind < 20). Eigener TTL-Cache, A-03a gilt weiter: EIN CouchDB-
// Read pro Fenster fuer alle Poller. Der Vollscan-Cache bleibt fuer die
// Archiv-/Abgeschlossen-Ansichten (ohne status bzw. status=abgeschlossen).
const AKTIV_LIST_FIND_LIMIT = 1000;
let einsatzAktivCache: {
  at: number;
  docs: Array<Record<string, unknown>>;
} | null = null;

function invalidateEinsatzCache(): void {
  einsatzListCache = null;
  einsatzAktivCache = null;
}

// ─── GET /api/einsaetze ─────────────────────────────────────
// F-29: Pagination via `limit` (Default 200, Max 500) + `skip`. Sortierung
// und Filterung passieren weiterhin in JS — bei <1000 Einsaetzen unkritisch.
// Response um `total`, `limit`, `skip` erweitert; `items` bleibt bestehende
// Liste damit Konsumenten nicht brechen.
// TODO P-05: Auf Mango-View (durch Index auf alarmierungZeit + status) migrieren wenn >1000 Einsätze
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 500;
einsaetzeRouter.get("/api/einsaetze", requireAuth(), ah(async (req, res) => {
  const status = req.query.status as string | undefined;
  // Pagination-Parameter — defensive parse, clamp auf erlaubte Range
  const rawLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIST_LIMIT)
      : DEFAULT_LIST_LIMIT;
  const rawSkip = Number.parseInt(String(req.query.skip ?? ""), 10);
  const skip = Number.isFinite(rawSkip) && rawSkip > 0 ? rawSkip : 0;

  let docs: Array<Record<string, unknown>>;
  if (status === "aktiv") {
    // C-07: Mango-Query (Index type-status) statt Vollscan — gecacht.
    const cachedAktiv = einsatzAktivCache;
    if (cachedAktiv && Date.now() - cachedAktiv.at < EINSATZ_LIST_CACHE_TTL_MS) {
      // Kopie: unten wird in-place sortiert, der Cache bleibt unberuehrt.
      docs = [...cachedAktiv.docs];
    } else {
      const found = await db.find({
        selector: { type: "einsatz", status: "aktiv" },
        limit: AKTIV_LIST_FIND_LIMIT,
      });
      const aktive = found.docs as Array<Record<string, unknown>>;
      if (aktive.length >= AKTIV_LIST_FIND_LIMIT) {
        logger.warn(
          { limit: AKTIV_LIST_FIND_LIMIT },
          "GET /api/einsaetze?status=aktiv: Find-Limit erreicht — Liste evtl. unvollstaendig",
        );
      }
      einsatzAktivCache = { at: Date.now(), docs: aktive };
      docs = [...aktive];
    }
  } else {
    // A-03a: rohes Scan-Ergebnis aus dem TTL-Cache bedienen wenn frisch —
    // Filter/Sortierung/Projektion laufen weiterhin pro Request (billig).
    let list: Awaited<ReturnType<typeof db.list>>;
    const cached = einsatzListCache;
    if (cached && Date.now() - cached.at < EINSATZ_LIST_CACHE_TTL_MS) {
      list = cached.list;
    } else {
      list = await db.list({
        startkey: "einsatz:",
        endkey: "einsatz:￰",
        include_docs: true,
        descending: false,
      });
      einsatzListCache = { at: Date.now(), list };
    }
    docs = list.rows
      .map((r) => r.doc as Record<string, unknown> | undefined)
      .filter((d): d is Record<string, unknown> => d !== undefined)
      .filter((d) => (d as { type?: string }).type === "einsatz");
    if (status === "abgeschlossen") {
      docs = docs.filter((d) => (d as { status?: string }).status === status);
    }
  }

  // Kein Fahrzeug-Filter mehr (Audit R3, User-Wunsch): jedes Tablet und die
  // Florianstation sehen alle aktiven Einsaetze. Beteiligt ist ein Fahrzeug,
  // wenn es einen Fahrzeugbericht fuehrt — nicht per Zuweisung.
  docs.sort(
    (a, b) =>
      new Date((b as { alarmierungZeit: string }).alarmierungZeit).getTime() -
      new Date((a as { alarmierungZeit: string }).alarmierungZeit).getTime(),
  );
  // total = Gesamtanzahl NACH Filter, VOR Pagination — fuer UI-Anzeige
  // "Zeige 1-200 von 423".
  const total = docs.length;
  const items = docs.slice(skip, skip + limit);

  // ING-10 Stufe 2 (4-Personas-Audit, 2026-06-12): Schlanke Poll-Projektion.
  // ?shape=poll schickt NUR der 5-s-Fahrzeug-Tablet-Poll (BerichtPage) —
  // die Items werden auf das geteilte Feld-Inventar EINSATZ_POLL_FELDER
  // reduziert (insb. ohne Chronik-Array + Brand-/Technisch-Statistik).
  // Stiller-Bruch-Schutz: Felder werden 1:1 kopiert wie das Einsatz-Doc
  // sie traegt (nur vorhandene Keys, kein Raten/Umbenennen). OHNE
  // shape-Param bleibt das Verhalten exakt wie bisher (volle Docs fuer
  // Florianstation, Lagekarten-Popout und Archiv).
  const shape = typeof req.query.shape === "string" ? req.query.shape : "";
  const shapedItems =
    shape === "poll"
      ? items.map((d) => {
          const source = d as Record<string, unknown>;
          const projected: Record<string, unknown> = {};
          for (const feld of EINSATZ_POLL_FELDER) {
            if (feld in source) projected[feld] = source[feld];
          }
          return projected;
        })
      : items;
  res.json({ ok: true, items: shapedItems, total, limit, skip });
}));

// ─── GET /api/einsaetze/:id ─────────────────────────────────
einsaetzeRouter.get("/api/einsaetze/:id", requireAuth(), ah(async (req, res) => {
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
}));

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
einsaetzeRouter.post("/api/einsaetze/manuell", requireAuth("mannschaft"), ah(async (req, res) => {
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
    invalidateEinsatzCache();
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
}));

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
  /** L-08 (Audit 2026-07): Zeitstempel des Abschluss-Dialogs am Client.
   *  Wurde der Einsatz NACH diesem Zeitpunkt reaktiviert, ist der Abschluss-
   *  Wunsch veraltet (er wuerde die Nach-Reaktivierungs-Arbeit ungesehen
   *  wegsperren) → 409 stale_abschluss. Optional fuer Backwards-Compat. */
  clientTs: z.string().datetime().optional(),
});
einsaetzeRouter.post("/api/einsaetze/:id/abschluss", requireAuth("mannschaft"), ah(async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const session = req.session!;
  const bodyParsed = AbschlussBodySchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    res.status(400).json({ error: "invalid_body", details: bodyParsed.error.flatten() });
    return;
  }
  const { abschlussOverrideHinweis: overrideHinweisFromBody, clientTs } = bodyParsed.data;
  const doc = await getEinsatzOr404(id, res);
  if (!doc) return;
  if (doc.status === "abgeschlossen") {
    res.status(409).json({ error: "already_closed" });
    return;
  }
  // L-08: Stale-Abschluss-Erkennung — gibt es eine Reaktivierung die JUENGER
  // ist als der Abschluss-Dialog des Clients, lehnen wir ab. Der Client laedt
  // dann den frischen Stand und der User entscheidet neu.
  if (clientTs) {
    const clientMs = new Date(clientTs).getTime();
    const reakts = (doc.reaktivierungen as Array<{ am?: string }> | undefined) ?? [];
    const staleAbschluss = reakts.some((r) => {
      const amMs = typeof r.am === "string" ? new Date(r.am).getTime() : Number.NaN;
      return Number.isFinite(amMs) && Number.isFinite(clientMs) && amMs > clientMs;
    });
    if (staleAbschluss) {
      res.status(409).json({ error: "stale_abschluss" });
      return;
    }
  }
  // U-05-Backend (Audit 2026-07): Uebungen kennen keine Verrechnung —
  // verrechenbar/rechnungsadresse aus dem Body werden ignoriert (nicht
  // persistiert, keine Verrechnungs-Kaskade auf die Fahrzeugberichte).
  const istUebung = doc.einsatzTyp === "uebung";
  const verrechenbar = istUebung ? undefined : bodyParsed.data.verrechenbar;
  const rechnungsadresse = istUebung ? undefined : bodyParsed.data.rechnungsadresse;
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
  const inArbeitFzgber = fzgDocs.filter(
    (f) => (f as { status?: string }).status === "in_arbeit",
  );
  // D-03 (Audit R3): Berichte, die beim Reaktivieren aus "abgeschlossen"
  // wieder geoeffnet wurden (Marker reaktiviertAusStatus), sind keine
  // "vergessenen" offenen Berichte — sie waren schon einmal fertig. Sie
  // erzeugen KEINEN Override-Hinweis und werden unten still mit Grund
  // "reaktivierung-wieder-geschlossen" zugemacht (Marker entfernt).
  const reaktivierteFzgber = inArbeitFzgber.filter(
    (f) => (f as { reaktiviertAusStatus?: string }).reaktiviertAusStatus === "abgeschlossen",
  );
  const offeneFzgber = inArbeitFzgber.filter(
    (f) => (f as { reaktiviertAusStatus?: string }).reaktiviertAusStatus !== "abgeschlossen",
  );
  // D-01 (Audit R3): Einsatzende-Fallback = groesstes zeit.bis aller
  // Fahrzeugberichte (letztes Fahrzeug eingerueckt). Erst wenn kein
  // Fahrzeug eine Rueckkehr-Zeit traegt, faellt einsatzende auf "jetzt".
  let maxFzgZeitBisMs = Number.NEGATIVE_INFINITY;
  for (const f of fzgDocs) {
    const bis = (f as { zeit?: { bis?: unknown } }).zeit?.bis;
    if (typeof bis !== "string" || !bis) continue;
    const t = new Date(bis).getTime();
    if (Number.isFinite(t) && t > maxFzgZeitBisMs) maxFzgZeitBisMs = t;
  }
  const maxFzgZeitBis = Number.isFinite(maxFzgZeitBisMs)
    ? new Date(maxFzgZeitBisMs).toISOString()
    : undefined;
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
  // AUDIT-11: Echte laufende Berichtsnummer (config:bericht-counter) beim
  // Abschluss vergeben — NUR wenn das Doc noch keine traegt. Reaktivieren +
  // erneuter Abschluss zieht damit KEINE zweite Nummer. Schlaegt die Vergabe
  // fehl (Counter-Doc dauerhaft contended), laeuft der Abschluss trotzdem
  // weiter — das PDF faellt dann auf deriveBerichtNrFromId zurueck.
  let berichtNummer = doc.berichtNummer as string | undefined;
  if (!berichtNummer) {
    try {
      // U-03: einsatzTyp mitgeben — Uebungen ziehen aus dem "U"-Nummernkreis.
      berichtNummer = await vergebeBerichtNummer(
        doc.einsatzart as string | undefined,
        doc.alarmierungZeit as string | undefined,
        doc.einsatzTyp as string | undefined,
      );
    } catch (err) {
      logger.warn(
        { err, id },
        "Berichtsnummer-Vergabe fehlgeschlagen — Abschluss laeuft ohne Nummer weiter",
      );
    }
  }
  // L-03 (Audit 2026-07): Abschluss-Patch als Funktion ueber dem Basis-Doc —
  // so kann der 409-Retry-Pfad denselben Patch auf den FRISCHEN Stand neu
  // applizieren statt mit stalem doc-Spread fremde Aenderungen zu verlieren.
  const abschlussPatch = (basis: Record<string, unknown>): Record<string, unknown> => ({
    ...basis,
    status: "abgeschlossen",
    schreibschutz: true,
    // D-01: bestehendes einsatzende (Editor-Eingabe oder frueherer Abschluss
    // vor einer Reaktivierung) hat Vorrang, dann letzte Fahrzeug-Rueckkehr,
    // erst dann "jetzt".
    einsatzende:
      (typeof basis.einsatzende === "string" && basis.einsatzende
        ? basis.einsatzende
        : undefined) ??
      maxFzgZeitBis ??
      new Date().toISOString(),
    oelbindemittel: oelbindemittelAggregiert,
    verrechnung: verrechnungUpdated,
    geaendertAm: new Date().toISOString(),
    ...(finalOverrideHinweis ? { abschlussOverrideHinweis: finalOverrideHinweis } : {}),
    ...(berichtNummer ? { berichtNummer } : {}),
  });
  let result: Awaited<ReturnType<typeof db.insert>>;
  try {
    result = await db.insert(abschlussPatch(doc));
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 409) throw err;
    // L-03: 409 — parallel hat jemand geschrieben (Doppel-Klick, zweites
    // Geraet, Florian). Frisch laden: ist der Zielzustand schon erreicht,
    // melden wir already_closed inkl. bereits vergebener Nummer; sonst
    // genau 1 Retry mit frischer _rev + neu appliziertem Patch.
    const fresh = await getEinsatzOr404(id, res);
    if (!fresh) return;
    if (fresh.status === "abgeschlossen") {
      res.status(409).json({
        error: "already_closed",
        ...(fresh.berichtNummer ? { berichtNummer: fresh.berichtNummer } : {}),
      });
      return;
    }
    result = await db.insert(abschlussPatch(fresh));
  }
  invalidateEinsatzCache();
  logger.info({ id, by: session.username, berichtNummer }, "Einsatz abgeschlossen");

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
    // A-07: Verrechnungs-Patch als Funktion ueber dem Basis-Doc — im
    // Conflict-Fall appliziert bulkUpdateWithRetry ihn auf den FRISCHEN
    // Stand (fremde Aenderungen am fzgber bleiben erhalten).
    const verrechnungPatch = (basis: Record<string, unknown>): Record<string, unknown> => ({
      verrechnung: {
        ...((basis as { verrechnung?: object }).verrechnung ?? {}),
        ...(verrechenbar !== undefined ? { verrechenbar } : {}),
        ...(rechnungsadresse !== undefined ? { rechnungsadresse } : {}),
      },
      geaendertAm: verrechnungCascadeNow,
    });
    const allFzgWithVerrechnung = fzgDocs.map((f) => ({
      ...(f as Record<string, unknown>),
      ...verrechnungPatch(f as Record<string, unknown>),
    }));
    try {
      await bulkUpdateWithRetry(allFzgWithVerrechnung, logger, (_docId, fresh) =>
        verrechnungPatch(fresh),
      );
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
  if (offeneFzgber.length > 0 || reaktivierteFzgber.length > 0) {
    const cascadeNow = new Date().toISOString();
    // A-07: Kaskaden-Patch (Auto-Abschluss-Marker) als konstante Absicht —
    // im Conflict-Fall wird er auf den frischen fzgber-Stand appliziert,
    // parallel eingetragene Mannschaft/KM/Taetigkeitsbericht bleiben so
    // erhalten statt vom stalen sourceDoc ueberschrieben zu werden.
    const cascadePatch: Record<string, unknown> = {
      status: "abgeschlossen" as const,
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: cascadeNow,
      autoAbgeschlossenGrund: "hauptauftrag-geschlossen" as const,
      geaendertAm: cascadeNow,
    };
    // D-03: eigener Patch fuer reaktivierte Berichte — anderer Grund, und
    // der Marker reaktiviertAusStatus wird entfernt (undefined → weg).
    const reaktCascadePatch: Record<string, unknown> = {
      status: "abgeschlossen" as const,
      autoAbgeschlossen: true,
      autoAbgeschlossenAm: cascadeNow,
      autoAbgeschlossenGrund: "reaktivierung-wieder-geschlossen" as const,
      reaktiviertAusStatus: undefined,
      geaendertAm: cascadeNow,
    };
    const patchById = new Map<string, Record<string, unknown>>();
    const cascadeDocs: Array<Record<string, unknown>> = [];
    for (const f of offeneFzgber) {
      const src = f as Record<string, unknown>;
      cascadeDocs.push({ ...src, ...cascadePatch });
      patchById.set(String(src._id), cascadePatch);
    }
    for (const f of reaktivierteFzgber) {
      const src = f as Record<string, unknown>;
      cascadeDocs.push({ ...src, ...reaktCascadePatch });
      patchById.set(String(src._id), reaktCascadePatch);
    }
    try {
      const { ok, failed } = await bulkUpdateWithRetry(
        cascadeDocs,
        logger,
        (docId) => patchById.get(docId) ?? null,
      );
      logger.info(
        {
          id,
          cascadeCount: cascadeDocs.length,
          reaktivierteCount: reaktivierteFzgber.length,
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
          invalidateEinsatzCache();
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
  // AUDIT-11: berichtNummer in der Response mitliefern — bestehende Felder
  // bleiben unveraendert, Clients ohne berichtNummer-Auswertung sind kompatibel.
  res.json({ ok: true, id, rev: result.rev, ...(berichtNummer ? { berichtNummer } : {}) });
}));

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
  ah(async (req, res) => {
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
    // L-03 (Audit 2026-07): Verwerfen-Patch als konstante Absicht — der
    // 409-Retry-Pfad appliziert ihn auf den FRISCHEN Stand neu.
    const verwerfenPatch: Record<string, unknown> = {
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
    let result: Awaited<ReturnType<typeof db.insert>>;
    try {
      result = await db.insert({ ...doc, ...verwerfenPatch });
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) throw err;
      // L-03: 409 — frisch laden; Zielzustand schon erreicht → already_closed
      // (inkl. ggf. vergebener Nummer), sonst genau 1 Retry mit frischer _rev.
      const fresh = await getEinsatzOr404(id, res);
      if (!fresh) return;
      if (fresh.status === "abgeschlossen") {
        res.status(409).json({
          error: "already_closed",
          ...(fresh.berichtNummer ? { berichtNummer: fresh.berichtNummer } : {}),
        });
        return;
      }
      result = await db.insert({ ...fresh, ...verwerfenPatch });
    }
    invalidateEinsatzCache();

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
            invalidateEinsatzCache();
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
  }),
);

// ─── Reaktivierungs-Helfer (Route /reaktivieren + V9 Auto-Reaktivierung) ──

/**
 * Reaktivierungs-Patch als Funktion ueber dem Basis-Doc — der 409-Retry
 * appliziert ihn auf den FRISCHEN Stand neu (inkl. dessen reaktivierungen-
 * Historie). L-04: Stale-Marker vom frueheren Abschluss/Verwerfen werden
 * EXPLIZIT entfernt (undefined → JSON.stringify laesst die Keys weg) —
 * sonst truege der reaktivierte Einsatz weiter verworfen/autoAbgeschlossen
 * & Co. und PDF/Archiv/Worker wuerden ihn falsch einordnen.
 *
 * D-01 (Audit R3): einsatzende bleibt beim Reaktivieren ERHALTEN — der
 * erneute /abschluss uebernimmt es (basis.einsatzende hat Vorrang), damit
 * ein Nachtrag am Folgetag nicht das reale Einsatzende ueberschreibt.
 *
 * Exportiert, weil fotos.ts (V9) denselben Patch braucht.
 */
export function reaktivierenPatch(
  basis: Record<string, unknown>,
  eintrag: { vonBenutzerId: string; grund?: string },
): Record<string, unknown> {
  return {
    ...basis,
    status: "aktiv",
    schreibschutz: false,
    reaktivierungen: [
      ...((basis.reaktivierungen as unknown[] | undefined) ?? []),
      {
        vonBenutzerId: eintrag.vonBenutzerId,
        am: new Date().toISOString(),
        grund: eintrag.grund,
        vonStatus: "abgeschlossen",
      },
    ],
    verworfen: undefined,
    verwerfungsGrund: undefined,
    autoAbgeschlossen: undefined,
    autoAbgeschlossenAm: undefined,
    autoAbgeschlossenGrund: undefined,
    abschlussOverrideHinweis: undefined,
    cascade_failed: undefined,
    cascade_failed_ids: undefined,
    geaendertAm: new Date().toISOString(),
  };
}

/**
 * Fahrzeugberichte eines Einsatzes nach dem Reaktivieren wieder oeffnen.
 *
 * BUG-Fix (Reaktivierung): Beim Hauptauftrag-Abschluss werden die offenen
 * Fahrzeugberichte kaskadiert geschlossen (autoAbgeschlossenGrund=
 * "hauptauftrag-geschlossen"). Beim Reaktivieren muss das rueckgaengig
 * gemacht werden — sonst bleibt der Fahrzeugbericht schreibgeschuetzt und
 * der Fahrzeugkommandant kommt nicht mehr an seine Mannschaft heran.
 *
 * D-03 (Audit R3): Jeder wieder geoeffnete Bericht bekommt den Marker
 * reaktiviertAusStatus:"abgeschlossen". Beim naechsten /abschluss zaehlt er
 * damit NICHT als "vergessener" offener Bericht (kein Override-Hinweis),
 * sondern wird still mit Grund "reaktivierung-wieder-geschlossen" zugemacht.
 *
 * S-07 (Audit R3): `nurFahrzeugId` — nur den Bericht dieses Fahrzeugs
 * oeffnen (Tablet-Nachtrag), die anderen bleiben abgeschlossen.
 *
 * A-07: Conflict-Retry appliziert den Reopen-Patch auf den frischen Stand —
 * und nur, wenn der Bericht dort noch abgeschlossen ist.
 */
async function oeffneFahrzeugberichteWieder(
  einsatzId: string,
  nurFahrzeugId?: string,
): Promise<{ ok: number; failed: string[] }> {
  const fzgPrefix = `fzgber:${einsatzId.replace(/^einsatz:/, "")}:`;
  const fzgList = await db.list({
    startkey: fzgPrefix,
    endkey: `${fzgPrefix}￰`,
    include_docs: true,
  });
  const reopenPatch: Record<string, unknown> = {
    status: "in_arbeit" as const,
    schreibschutz: false,
    // Auto-Abschluss-Marker entfernen (undefined → JSON laesst sie weg).
    autoAbgeschlossen: undefined,
    autoAbgeschlossenAm: undefined,
    autoAbgeschlossenGrund: undefined,
    reaktiviertAusStatus: "abgeschlossen" as const,
    geaendertAm: new Date().toISOString(),
  };
  const wiederOeffnen = fzgList.rows
    .map((r) => r.doc)
    .filter((d): d is NonNullable<typeof d> => !!d)
    .filter((f) => (f as { status?: string }).status === "abgeschlossen")
    .filter(
      (f) =>
        !nurFahrzeugId ||
        (f as { fahrzeugId?: string }).fahrzeugId === nurFahrzeugId,
    )
    .map((f) => ({ ...(f as Record<string, unknown>), ...reopenPatch }));
  if (wiederOeffnen.length === 0) return { ok: 0, failed: [] };
  return bulkUpdateWithRetry(wiederOeffnen, logger, (_docId, fresh) =>
    fresh.status === "abgeschlossen" ? reopenPatch : null,
  );
}

/** V9: Auto-Abschluss-Grund, bei dem spaete Daten den Einsatz wieder oeffnen. */
const AUTO_REAKTIVIERBARER_GRUND = "unbefuellt-1h";
/** V9: Reaktivierungs-Grund im Audit-Trail + reaktivierungen[]. */
const AUTO_REAKTIVIERUNGS_GRUND = "late-data-after-unbefuellt-1h";

/**
 * V9 (Audit R3): Auto-Reaktivierung bei spaeten Daten.
 *
 * Der Auto-Close-Worker schliesst unbefuellte Alarme nach 1 h (Grund
 * "unbefuellt-1h"). Kommt DANACH doch noch ein Schreibzugriff (Fahrzeug-
 * bericht, Editor-PUT, Chronik, Foto) — typisch: Tablet war im Funkloch,
 * Outbox liefert verspaetet — soll der Request nicht mit 423 scheitern,
 * sondern der Einsatz automatisch wieder geoeffnet und der Request normal
 * verarbeitet werden. Fuer alle ANDEREN Abschluss-Gruende (menschlich,
 * inaktiv-6h, verworfen) bleibt 423: dort ist der Abschluss gewollt.
 *
 * Aufruf NUR wenn doc.schreibschutz === true.
 *
 * @returns das reaktivierte Doc (frische _rev) — oder null, wenn nicht
 *          anwendbar (Caller antwortet 423 schreibschutz_aktiv).
 */
export async function reaktiviereBeiSpaetenDaten(
  doc: Record<string, unknown>,
  session: SessionPayload,
  ip: string | undefined,
): Promise<Record<string, unknown> | null> {
  if (doc.autoAbgeschlossenGrund !== AUTO_REAKTIVIERBARER_GRUND) return null;
  const id = String(doc._id);
  const eintrag = { vonBenutzerId: session.sub, grund: AUTO_REAKTIVIERUNGS_GRUND };
  let reaktiviert: Record<string, unknown>;
  try {
    const patched = reaktivierenPatch(doc, eintrag);
    const r = await db.insert(patched);
    reaktiviert = { ...patched, _rev: r.rev };
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 409) throw err;
    // 409: parallel geschrieben (zweites Tablet liefert gleichzeitig nach).
    const fresh = (await db.get(id)) as Record<string, unknown>;
    if (fresh.status === "aktiv" && fresh.schreibschutz !== true) {
      // Bereits (auto-)reaktiviert — idempotent weiter.
      return fresh;
    }
    if (fresh.autoAbgeschlossenGrund !== AUTO_REAKTIVIERBARER_GRUND) {
      // Inzwischen anders abgeschlossen (z. B. menschlich) → gewollt, 423.
      return null;
    }
    const patched = reaktivierenPatch(fresh, eintrag);
    const r = await db.insert(patched);
    reaktiviert = { ...patched, _rev: r.rev };
  }
  invalidateEinsatzCache();
  logger.warn(
    { id, by: session.username },
    "Einsatz AUTO-REAKTIVIERT — spaete Daten nach unbefuellt-1h-Auto-Abschluss",
  );
  try {
    const { ok, failed } = await oeffneFahrzeugberichteWieder(id);
    if (ok > 0 || failed.length > 0) {
      logger.info(
        { id, reopened: ok, failed: failed.length },
        "Fahrzeugberichte bei Auto-Reaktivierung wieder geoeffnet",
      );
    }
  } catch (err) {
    logger.warn(
      { err, id },
      "Fahrzeugbericht-Reopen bei Auto-Reaktivierung fehlgeschlagen — Einsatz ist trotzdem reaktiviert",
    );
  }
  await writeAuditEvent({
    type: "einsatz-reaktivierung",
    actorUsername: session.username,
    actorRolle: session.rolle,
    einsatzId: id,
    ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
    ...(ip ? { ipAddress: ip } : {}),
    details: { grund: AUTO_REAKTIVIERUNGS_GRUND, automatisch: true },
  });
  return reaktiviert;
}

// ─── POST /api/einsaetze/:id/reaktivieren ─── FR-14 ─────────
const ReaktivierenBodySchema = z.object({
  // Grund optional (User-Wunsch): wer etwas einträgt, gut — wer nicht, hat
  // auch seine Gründe. Kein Mindestlängen-Zwang. Audit-Event wird trotzdem
  // geschrieben (mit leerem Grund, falls keiner angegeben).
  grund: z.string().optional(),
  /** S-07 (Audit R3): nur den Fahrzeugbericht DIESES Fahrzeugs wieder
   *  oeffnen (Tablet-Nachtrag) — die anderen bleiben abgeschlossen. Ohne
   *  Angabe werden wie bisher alle abgeschlossenen Berichte geoeffnet. */
  nurFahrzeugId: z.string().min(1).optional(),
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
  ah(async (req, res) => {
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
    // L-03/L-04 (Audit 2026-07): Reaktivierungs-Patch als Funktion ueber dem
    // Basis-Doc (siehe reaktivierenPatch oben) — der 409-Retry appliziert
    // ihn auf den FRISCHEN Stand neu.
    const eintrag = { vonBenutzerId: session.sub, grund: parsed.data.grund };
    let result: Awaited<ReturnType<typeof db.insert>>;
    try {
      result = await db.insert(reaktivierenPatch(doc, eintrag));
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) throw err;
      // L-03: 409 — frisch laden; ist der Einsatz inzwischen schon aktiv
      // (paralleles Reaktivieren), antworten wir idempotent 200 ok. Sonst
      // genau 1 Retry mit frischer _rev + neu appliziertem Patch.
      const fresh = await getEinsatzOr404(id, res);
      if (!fresh) return;
      if (fresh.status === "aktiv") {
        invalidateEinsatzCache();
        res.json({ ok: true, id, rev: fresh._rev, idempotent: true });
        return;
      }
      result = await db.insert(reaktivierenPatch(fresh, eintrag));
    }
    invalidateEinsatzCache();
    logger.warn(
      { id, by: session.username, grund: parsed.data.grund, nurFahrzeugId: parsed.data.nurFahrzeugId },
      "Einsatz REAKTIVIERT — Audit-Trail aktualisiert",
    );

    // Fahrzeugberichte wieder oeffnen (siehe oeffneFahrzeugberichteWieder:
    // D-03-Marker + S-07 nurFahrzeugId). Schlaegt das fehl, bleibt der
    // Einsatz trotzdem reaktiviert (nicht blockierend).
    try {
      const { ok, failed } = await oeffneFahrzeugberichteWieder(
        id,
        parsed.data.nurFahrzeugId,
      );
      if (ok > 0 || failed.length > 0) {
        logger.info(
          { id, reopened: ok, failed: failed.length, nurFahrzeugId: parsed.data.nurFahrzeugId },
          "Fahrzeugberichte beim Reaktivieren wieder geöffnet",
        );
      }
    } catch (err) {
      logger.warn(
        { err, id },
        "Fahrzeugbericht-Reopen beim Reaktivieren fehlgeschlagen — Einsatz ist trotzdem reaktiviert",
      );
    }
    // Audit-Trail (Spec §17.1) — Reaktivierungen MÜSSEN nachvollziehbar sein.
    // Pflicht-Begründung wird im `details`-Feld mitgeschrieben.
    await writeAuditEvent({
      type: "einsatz-reaktivierung",
      actorUsername: session.username,
      actorRolle: session.rolle,
      einsatzId: id,
      ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
      details: {
        grund: parsed.data.grund,
        ...(parsed.data.nurFahrzeugId ? { nurFahrzeugId: parsed.data.nurFahrzeugId } : {}),
      },
    });
    res.json({ ok: true, id, rev: result.rev });
  }),
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
  // Grund optional (User-Wunsch) — Audit-Event/Tombstone wird trotzdem
  // geschrieben, nur ohne Mindestlängen-Zwang.
  grund: z.string().optional(),
});

einsaetzeRouter.delete(
  "/api/einsaetze/:id",
  requireAuth("einsatzleiter"),
  ah(async (req, res) => {
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

    // D-05 (Audit R3): Fotos gehoeren zum Einsatz (foto:<suffix>:<fotoId>,
    // siehe fotos.ts) — ohne Kaskade blieben sie als verwaiste Bild-Docs
    // (je bis zu mehrere 100 kB dataUrl) dauerhaft in CouchDB liegen.
    const fotoPrefix = `foto:${id.replace(/^einsatz:/, "")}:`;
    const fotoList = await db.list({
      startkey: fotoPrefix,
      endkey: `${fotoPrefix}￰`,
      include_docs: true,
    });
    const fotoDocs = fotoList.rows
      .map((r) => r.doc)
      .filter((d): d is NonNullable<typeof d> => !!d)
      .filter((d) => (d as { type?: string }).type === "foto");
    const cascadeFotoIds = fotoDocs.map((f) => (f as { _id?: string })._id ?? "?");

    // Bulk-Delete: alle Fahrzeugberichte + Fotos + Einsatz selbst in einer
    // bulk_docs-Operation. So bleibt das Loeschen atomar im
    // Concurrency-Sinne (gleiche Update-Sequence).
    const bulkDocs: Array<Record<string, unknown>> = [
      ...fzgDocs.map((f) => ({ ...(f as Record<string, unknown>), _deleted: true })),
      ...fotoDocs.map((f) => ({ ...(f as Record<string, unknown>), _deleted: true })),
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
      // A-07: patchFor liefert die Loesch-Absicht — im Conflict-Fall wird
      // `{ ...fresh, _deleted: true }` inserted (valider Tombstone auf der
      // frischen _rev) statt des stalen sourceDoc-Stands.
      ({ failed } = await bulkUpdateWithRetry(bulkDocs, logger, () => ({
        _deleted: true,
      })));
    } catch (err) {
      logger.error(
        { err, id, count: bulkDocs.length },
        "Loeschen des Einsatzes fehlgeschlagen — Tombstones nicht gesetzt",
      );
      res.status(500).json({ error: "delete_failed", message: String(err) });
      return;
    }
    invalidateEinsatzCache();

    logger.warn(
      {
        id,
        by: session.username,
        grund: parsed.data.grund,
        fzgCount: cascadeIds.length,
        fotoCount: cascadeFotoIds.length,
        ...(failed.length > 0 ? { cascade_failed: failed } : {}),
      },
      failed.length > 0
        ? "Einsatz geloescht — aber einzelne Cascade-Docs blieben nach Retry als Orphan zurueck"
        : "Einsatz GELOESCHT — Cascade auf Fahrzeugberichte + Fotos",
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
        cascade_fotos: cascadeFotoIds,
        ...(failed.length > 0 ? { cascade_failed: failed } : {}),
      },
    });
    res.json({
      ok: true,
      id,
      deleted: true,
      cascade_fzgber: cascadeIds.length,
      fotos: cascadeFotoIds.length,
      ...(failed.length > 0 ? { cascade_failed: failed } : {}),
    });
  }),
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
  "lotsendienstAuftraggeber",
  "lotsendienstRoute",
  "uebungThema",
  "uebungsleiter",
  "uebungsTyp",
  "anrufer",
  "anruferTel",
  "einsatzauftragVia",
  // Audit R3 (V4): Einsatzende ist im Florian-Editor korrigierbar (D-01),
  // Alarm-Annahme am Florian (angenommenVon/-Am) wird per PUT gesetzt.
  "einsatzende",
  "angenommenVon",
  "angenommenAm",
  // #1 (Test 2026-06-03): Koordinaten editierbar — wenn der EL (Florian) oder
  // der Fahrzeug-Kdt (GPS-Knopf) die Einsatzadresse korrigiert, wird die neue
  // Position mitgeschickt, damit die Lagekarte zur Adresse passt.
  "koordinaten",
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
einsaetzeRouter.put("/api/einsaetze/:id", requireAuth("mannschaft"), ah(async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const session = req.session!;
  let current = await getEinsatzOr404(id, res);
  if (!current) return;
  if (current.schreibschutz === true) {
    // V9: nach "unbefuellt-1h"-Auto-Abschluss oeffnen spaete Daten den
    // Einsatz automatisch wieder; jeder andere Abschluss bleibt gesperrt.
    const reaktiviert = await reaktiviereBeiSpaetenDaten(current, session, req.ip);
    if (!reaktiviert) {
      res.status(423).json({ error: "schreibschutz_aktiv", hint: "Bericht muss erst reaktiviert werden (FR-14)." });
      return;
    }
    current = reaktiviert;
  }
  // Field-Allowlist: nur whitelisted Keys aus dem Body uebernehmen.
  // Schuetzt vor Privilege-Escalation via PUT (Status reset, schreibschutz
  // umgehen, Audit-Felder manipulieren). Felder mit "vidi"-Prefix sind
  // erlaubt damit der Florian-Editor Vidierungs-Workflows pflegen kann.
  const body = (req.body ?? {}) as Record<string, unknown>;
  // S-03/S-13 (Audit R3): Optimistic Locking fuer den Editor. Der Client
  // schickt den editorGeaendertAm-Stand mit, den er beim Laden gesehen hat.
  // Hat ein ZWEITER Editor seither geschrieben (Wert ungleich), lehnen wir
  // mit 409 editor_conflict ab und liefern den aktuellen Stand mit — der
  // Client laedt neu statt fremde Eingaben zu ueberschreiben. Chronik-
  // Broadcasts/Positions-Updates/Worker aendern editorGeaendertAm NICHT,
  // erzeugen also keinen Fehlalarm. Das Feld ist KEIN Doc-Feld und wird
  // vor dem Merge entfernt (steht ohnehin nicht in der Allowlist).
  const expectedEditorGeaendertAm =
    typeof body.expectedEditorGeaendertAm === "string" && body.expectedEditorGeaendertAm
      ? body.expectedEditorGeaendertAm
      : undefined;
  delete body.expectedEditorGeaendertAm;
  const pruefeEditorKonflikt = (stand: Record<string, unknown>): boolean => {
    if (!expectedEditorGeaendertAm) return false;
    const aktuell = stand.editorGeaendertAm;
    if (typeof aktuell !== "string" || !aktuell) return false;
    return aktuell !== expectedEditorGeaendertAm;
  };
  if (pruefeEditorKonflikt(current)) {
    res.status(409).json({
      error: "editor_conflict",
      editorGeaendertAm: current.editorGeaendertAm,
    });
    return;
  }
  const safeBody: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (PUT_EINSATZ_ALLOWED_FIELDS.has(key) || key.startsWith("vidi")) {
      safeBody[key] = body[key];
    }
  }
  const editorNow = new Date().toISOString();
  const merged = {
    ...current,
    ...safeBody,
    _id: current._id,
    _rev: current._rev,
    type: "einsatz",
    geaendertAm: editorNow,
    // V4: jeder Editor-PUT stempelt editorGeaendertAm (nur dieser Endpunkt).
    editorGeaendertAm: editorNow,
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
    // S-03: auch im Retry-Pfad — hat der Konflikt-Verursacher ein anderer
    // Editor-PUT war, ist der frische Stand ein Editor-Konflikt.
    if (pruefeEditorKonflikt(fresh)) {
      res.status(409).json({
        error: "editor_conflict",
        editorGeaendertAm: fresh.editorGeaendertAm,
      });
      return;
    }
    const retryNow = new Date().toISOString();
    const retryMerged = {
      ...fresh,
      ...safeBody,
      _id: fresh._id,
      _rev: fresh._rev,
      type: "einsatz",
      geaendertAm: retryNow,
      editorGeaendertAm: retryNow,
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
  // A-03a: erfolgreicher Schreibzugriff — Liste-Cache invalidieren, damit
  // die Aenderung fuer alle Poller sofort sichtbar ist.
  invalidateEinsatzCache();
  res.json({ ok: true, id, rev: result.rev });
}));

// ─── PUT /api/einsaetze/:id/fahrzeugbericht/:fzgId ─────────────
/**
 * D-14 / V7 (Audit R3): Allowlist der Felder, die das Fahrzeug-Tablet (und
 * der QR-Handoff) ueber das fzgber-PUT schreiben darf. Identitaet (_id,
 * einsatzId, fahrzeugId, type), Audit-Marker (autoAbgeschlossen*, verworfen,
 * reaktiviertAusStatus, erstelltAm/geaendertAm) und die Verrechnungs-
 * Kaskade (verrechnung — kommt nur ueber /abschluss) werden stillschweigend
 * gefiltert. Das bisherige "_"-Strip (A-05) bleibt als zweite Schicht.
 */
const PUT_FZGBER_ALLOWED_FIELDS = new Set<string>([
  "zeit",
  "km",
  "gpsTrack",
  "fahrerPersonId",
  "fahrzeugKdtPersonId",
  "kdtIstEinsatzleiter",
  "mannschaft",
  "geraete",
  "oelbindemittelSaecke",
  "taetigkeitsbericht",
  "status",
  "lastWriterDeviceId",
  "anhaengerMitgenommen",
]);

einsaetzeRouter.put(
  "/api/einsaetze/:id/fahrzeugbericht/:fzgId",
  // V7: mannschaft+ (jeder Aufgaben-Mitarbeiter), reine Read-only-User nicht.
  requireAuth("mannschaft"),
  ah(async (req, res) => {
    const einsatzId = decodeURIComponent(String(req.params.id));
    const fahrzeugId = decodeURIComponent(String(req.params.fzgId));
    const docId = `fzgber:${einsatzId.replace(/^einsatz:/, "")}:${fahrzeugId}`;
    const session = req.session!;

    // Schreibschutz-Check via Einsatz
    const einsatz = (await db.get(einsatzId).catch(() => null)) as Record<string, unknown> | null;
    if (!einsatz) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    if (einsatz.schreibschutz === true) {
      // V9: nach "unbefuellt-1h"-Auto-Abschluss oeffnen spaete Daten den
      // Einsatz (inkl. seiner Fahrzeugberichte) automatisch wieder.
      const reaktiviert = await reaktiviereBeiSpaetenDaten(einsatz, session, req.ip);
      if (!reaktiviert) {
        res.status(423).json({ error: "schreibschutz_aktiv" });
        return;
      }
    }

    let existing: Record<string, unknown> | null = null;
    try {
      existing = (await db.get(docId)) as Record<string, unknown>;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }

    const now = new Date().toISOString();
    // A-05 (Audit 2026-07): Body-Keys mit "_"-Praefix VOR dem Merge strippen.
    // Sonst koennte der Client CouchDB-Metafelder injizieren (_rev → gezielter
    // Conflict/Overwrite, _deleted → Doc-Tombstone, _id → Umleitung) — die
    // Zeilen unterhalb setzen _id/_rev zwar explizit, aber nur gegen die
    // bekannten Felder; _deleted & Co. ruetschten ungefiltert durch.
    // V7: zusaetzlich Field-Allowlist (PUT_FZGBER_ALLOWED_FIELDS).
    const bodyRaw = (req.body ?? {}) as Record<string, unknown>;
    const body: Record<string, unknown> = {};
    for (const key of Object.keys(bodyRaw)) {
      if (key.startsWith("_")) continue;
      if (!PUT_FZGBER_ALLOWED_FIELDS.has(key)) continue;
      body[key] = bodyRaw[key];
    }
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
      ...body,
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
  }),
);

// ─── POST /api/einsaetze/:id/chronik ──────────────────────────
// Append-only Endpoint für Einsatzchronik. Wird von jedem Fahrzeug-
// Tablet aufgerufen wenn ein Diktat / Auftrag / Status-Event eintritt.
// Idempotent über entry.id — wenn der Eintrag schon vorhanden ist,
// 200 OK ohne erneutes Insert (verhindert Duplikate bei Retry/Sync).
// Tablets pollen GET .../chronik in 8s-Intervallen und mergen
// Einträge ihrer Geschwister-Fahrzeuge → echter Cross-Check.
/** C-06: Toleranz zwischen Client-Zeitstempel und Server-Empfang. */
const CHRONIK_ZEIT_TOLERANZ_MS = 5 * 60 * 1000;

const ChronikEintragBodySchema = z.object({
  id: z.string().min(1),
  // C-06 (Audit R3): echtes ISO-Datum (UTC "Z" oder Offset) — freie Strings
  // liessen sich weder sortieren noch gegen die Server-Zeit pruefen.
  zeitstempel: z.string().datetime({ offset: true }),
  funkrufname: z.string().min(1),
  fahrzeugId: z.string().min(1),
  source: z.enum(["blaulichtsms", "fahrzeug", "manuell", "atemschutz"]),
  text: z.string().min(1).max(2000),
  pending: z.boolean().optional(),
  transkriptStatus: z.enum(["pending", "verfuegbar", "fehlgeschlagen"]).optional(),
  // Foto-Funktion (2026-06-03): Referenz aufs foto:-Doc (falls Foto-Eintrag).
  fotoId: z.string().optional(),
});

einsaetzeRouter.post("/api/einsaetze/:id/chronik", requireAuth(), ah(async (req, res) => {
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
    // V9: nach "unbefuellt-1h"-Auto-Abschluss oeffnen spaete Daten den
    // Einsatz automatisch wieder (Outbox liefert Chronik verspaetet).
    const reaktiviert = await reaktiviereBeiSpaetenDaten(doc, req.session!, req.ip);
    if (!reaktiviert) {
      // 423 = Locked. Hint-Feld traegt eine User-lesbare Erlaeuterung damit
      // das Frontend (Tablet/Florianstation) einen verstaendlichen Toast
      // anzeigen kann anstatt den nackten Error-Code.
      res.status(423).json({
        error: "schreibschutz_aktiv",
        hint: "Bericht ist abgeschlossen - bitte zuerst reaktivieren",
      });
      return;
    }
    doc = reaktiviert;
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

  // C-06 (Audit R3): Server-Empfangszeit stempeln (empfangenAm immer im
  // Eintrag). Der Client-Zeitstempel wird NUR ersetzt, wenn er unparsbar ist
  // oder mehr als 5 min in der ZUKUNFT liegt (Tablet-Uhr geht vor — das kann
  // kein echter Eintrag sein). Ein Zeitstempel in der Vergangenheit bleibt
  // erhalten: Nach 40 min Funkloch liefert die Outbox korrekte, aber alte
  // Eintraege nach — die duerfen nicht auf die Empfangszeit springen, sonst
  // ist genau die Chronologie kaputt, die hier geschuetzt werden soll. Eine
  // nachgehende Uhr ist davon nicht unterscheidbar; sie wird nur geloggt.
  const empfangenAm = new Date().toISOString();
  const clientMs = Date.parse(parsed.data.zeitstempel);
  const abweichungMs = clientMs - Date.now();
  let zeitstempel = parsed.data.zeitstempel;
  if (!Number.isFinite(clientMs) || abweichungMs > CHRONIK_ZEIT_TOLERANZ_MS) {
    logger.warn(
      {
        id,
        entryId: parsed.data.id,
        fzg: parsed.data.fahrzeugId,
        clientZeitstempel: parsed.data.zeitstempel,
        empfangenAm,
        abweichungSek: Number.isFinite(abweichungMs) ? Math.round(abweichungMs / 1000) : null,
      },
      "POST chronik: Client-Zeitstempel unparsbar oder > 5 min in der Zukunft — empfangenAm uebernommen",
    );
    zeitstempel = empfangenAm;
  } else if (-abweichungMs > CHRONIK_ZEIT_TOLERANZ_MS) {
    logger.info(
      {
        id,
        entryId: parsed.data.id,
        fzg: parsed.data.fahrzeugId,
        verspaetungSek: Math.round(-abweichungMs / 1000),
      },
      "POST chronik: Eintrag > 5 min alt (Outbox-Nachlieferung oder nachgehende Uhr) — Client-Zeit beibehalten",
    );
  }
  const eintrag = { ...parsed.data, zeitstempel, empfangenAm };

  const updated = {
    ...doc,
    chronik: [...chronik, eintrag],
    geaendertAm: new Date().toISOString(),
  };
  let result: Awaited<ReturnType<typeof db.insert>>;
  let totalNach = chronik.length + 1;
  try {
    result = await db.insert(updated);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 409) throw err;
    // A-02 (Audit 2026-07): 409 — ein paralleler Chronik-Broadcast (anderes
    // Fahrzeug/Florian) hat zwischen unserem get und insert geschrieben.
    // Frisch laden, Eintrag auf den FRISCHEN Stand applizieren (inkl.
    // erneutem Dedupe-Check), genau 1 Retry. Zweiter 409 → 409
    // conflict_retry_failed, der Client synct beim naechsten Poll nach.
    const fresh = (await db.get(id)) as Record<string, unknown>;
    const freshChronik = ((fresh.chronik as unknown[] | undefined) ?? []) as Array<{
      id: string;
    }>;
    if (freshChronik.some((e) => e.id === parsed.data.id)) {
      res.json({ ok: true, deduped: true, total: freshChronik.length });
      return;
    }
    const retryUpdated = {
      ...fresh,
      chronik: [...freshChronik, eintrag],
      geaendertAm: new Date().toISOString(),
    };
    try {
      result = await db.insert(retryUpdated);
      totalNach = freshChronik.length + 1;
    } catch (retryErr) {
      if ((retryErr as { statusCode?: number }).statusCode === 409) {
        logger.warn({ id }, "POST chronik: Retry erneut 409 — conflict_retry_failed");
        res.status(409).json({
          error: "conflict_retry_failed",
          hint: "Chronik wurde zwischenzeitlich von anderer Seite geaendert. Bitte erneut versuchen.",
        });
        return;
      }
      throw retryErr;
    }
  }
  invalidateEinsatzCache();
  logger.info(
    { id, source: parsed.data.source, fzg: parsed.data.fahrzeugId },
    "Chronik-Eintrag broadcast",
  );
  res.json({ ok: true, rev: result.rev, total: totalNach });
}));

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
  ah(async (req, res) => {
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
    // A-07: patchFor appliziert den Text-Edit auf das FRISCHE chronik-Array —
    // parallel eingetroffene Eintraege anderer Fahrzeuge bleiben erhalten.
    // Ist der Eintrag im frischen Stand verschwunden → null → failed → 409.
    const { ok, failed } = await bulkUpdateWithRetry([updated], logger, (_docId, fresh) => {
      const freshChronik = ((fresh.chronik as unknown[] | undefined) ?? []) as Array<
        Record<string, unknown>
      >;
      const fi = freshChronik.findIndex((e) => (e as { id?: string }).id === entryId);
      if (fi < 0) return null;
      const nextFresh = [...freshChronik];
      nextFresh[fi] = {
        ...freshChronik[fi],
        text: parsed.data.text,
        editiertAm: now,
        editiertVon: session.username,
      };
      return { chronik: nextFresh, geaendertAm: new Date().toISOString() };
    });
    if (failed.length > 0 || ok === 0) {
      res.status(409).json({
        error: "conflict_retry_failed",
        hint: "Eintrag wurde zwischenzeitlich geaendert. Bitte erneut versuchen.",
      });
      return;
    }
    invalidateEinsatzCache();
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
  }),
);

// ─── DELETE /api/einsaetze/:id/chronik/:entryId ──────────────
// D-11 / V6 (Audit R3): Chronik-Eintrag loeschen — als SOFT-Delete. Der
// Eintrag bleibt im Array (Audit-Trail, Idempotenz des POST-Dedupe ueber
// entry.id bleibt intakt), traegt aber geloescht:true + geloeschtAm/-Von;
// PDF und UI blenden ihn aus. Rolle einsatzleiter+: das Loeschen ist
// (anders als der Text-Edit) eine Entscheidung der Einsatzleitung.
// Idempotent: bereits geloeschter Eintrag → 200 ohne erneuten Write.
einsaetzeRouter.delete(
  "/api/einsaetze/:id/chronik/:entryId",
  requireAuth("einsatzleiter"),
  ah(async (req, res) => {
    const id = decodeURIComponent(String(req.params.id));
    const entryId = decodeURIComponent(String(req.params.entryId));
    const session = req.session!;
    const doc = await getEinsatzOr404(id, res);
    if (!doc) return;
    if (doc.schreibschutz === true) {
      // Selber Code wie POST/PUT chronik — Frontend reagiert einheitlich.
      res.status(423).json({
        error: "schreibschutz_aktiv",
        hint: "Bericht ist abgeschlossen - bitte zuerst reaktivieren",
      });
      return;
    }
    const chronik = ((doc.chronik as unknown[] | undefined) ?? []) as Array<
      Record<string, unknown>
    >;
    const idx = chronik.findIndex((e) => (e as { id?: string }).id === entryId);
    if (idx < 0) {
      res.status(404).json({ error: "entry_not_found" });
      return;
    }
    if (chronik[idx]?.geloescht === true) {
      res.json({ ok: true, deduped: true });
      return;
    }
    const now = new Date().toISOString();
    const loeschMarker = {
      geloescht: true,
      geloeschtAm: now,
      geloeschtVon: session.username,
    };
    // Soft-Delete-Patch als Funktion ueber dem chronik-Array — A-07: im
    // Conflict-Fall wird er auf das FRISCHE Array appliziert, parallel
    // eingetroffene Eintraege anderer Fahrzeuge bleiben erhalten. Ist der
    // Eintrag im frischen Stand verschwunden → null → failed → 409.
    const softDeletePatch = (
      basisChronik: Array<Record<string, unknown>>,
    ): Record<string, unknown> | null => {
      const i = basisChronik.findIndex((e) => (e as { id?: string }).id === entryId);
      if (i < 0) return null;
      const next = [...basisChronik];
      next[i] = { ...basisChronik[i], ...loeschMarker };
      return { chronik: next, geaendertAm: new Date().toISOString() };
    };
    const patch = softDeletePatch(chronik);
    if (!patch) {
      res.status(404).json({ error: "entry_not_found" });
      return;
    }
    const { ok, failed } = await bulkUpdateWithRetry(
      [{ ...doc, ...patch }],
      logger,
      (_docId, fresh) =>
        softDeletePatch(
          ((fresh.chronik as unknown[] | undefined) ?? []) as Array<Record<string, unknown>>,
        ),
    );
    if (failed.length > 0 || ok === 0) {
      res.status(409).json({
        error: "conflict_retry_failed",
        hint: "Eintrag wurde zwischenzeitlich geaendert. Bitte erneut versuchen.",
      });
      return;
    }
    invalidateEinsatzCache();
    logger.info({ id, entryId, by: session.username }, "Chronik-Eintrag geloescht (soft)");
    await writeAuditEvent({
      type: "chronik-delete",
      actorUsername: session.username,
      actorRolle: session.rolle,
      einsatzId: id,
      ...(session.fahrzeugId ? { fahrzeugId: session.fahrzeugId } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
      details: { entryId },
    });
    res.json({ ok: true });
  }),
);

// ─── GET /api/einsaetze/:id/chronik ───────────────────────────
// Liefert nur die chronik-Sub-Liste. Tablets pollen das alle 8s und
// vergleichen mit ihrem lokalen Set — neue Einträge werden lokal
// angehängt, Duplikate über entry.id gefiltert.
einsaetzeRouter.get("/api/einsaetze/:id/chronik", requireAuth(), ah(async (req, res) => {
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
}));

// ─── GET /api/einsaetze/:id/fahrzeugberichte ───────────────────
einsaetzeRouter.get(
  "/api/einsaetze/:id/fahrzeugberichte",
  requireAuth(),
  ah(async (req, res) => {
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
  }),
);

// ─── GET /api/fahrzeugberichte/meine ───────────────────────────
// Liefert alle Fahrzeugberichte eines bestimmten Fahrzeugs zusammen mit
// den Einsatz-Stammdaten (Stichwort/Adresse/Datum) als zusammengefasste
// Items fuer das Tablet-Archiv. Default-Filter: status=abgeschlossen, damit
// nur fertig gearbeitete Berichte erscheinen. Sortierung nach Alarmzeit DESC.
// A-03a (Audit 2026-07): limit-Param gegen unbegrenzt wachsende Antwort —
// das Tablet-Archiv braucht nur die juengsten Berichte, nicht Jahre an
// Historie. Gekappt wird nach geaendertAm absteigend (die zuletzt
// bearbeiteten Berichte bleiben erhalten).
// C-07 (Audit R3): Mango-Query auf den Index type-fahrzeugId-status statt
// fzgber:-Vollscan ueber ALLE Fahrzeuge. Mango kann ohne Index auf
// geaendertAm nicht serverseitig nach Aktualitaet sortieren — darum ein
// grosszuegiges Find-Limit (ein Fahrzeug hat < 300 Berichte/Jahr), die
// Sortierung + Kappung auf `limit` bleiben wie bisher in JS.
const MEINE_DEFAULT_LIMIT = 100;
const MEINE_MAX_LIMIT = 500;
const MEINE_FIND_LIMIT = 2000;
einsaetzeRouter.get(
  "/api/fahrzeugberichte/meine",
  requireAuth(),
  ah(async (req, res) => {
    const fahrzeugId =
      typeof req.query.fahrzeugId === "string" ? req.query.fahrzeugId : "";
    if (!fahrzeugId) {
      res.status(400).json({ error: "fahrzeugId_required" });
      return;
    }
    const statusFilter =
      typeof req.query.status === "string" ? req.query.status : "abgeschlossen";
    const rawLimit = Number.parseInt(String(req.query.limit ?? ""), 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, MEINE_MAX_LIMIT)
        : MEINE_DEFAULT_LIMIT;
    // C-07: Selektor deckt den Index type-fahrzeugId-status ab; bei
    // status=alle nur den Praefix (type, fahrzeugId).
    const found = await db.find({
      selector: {
        type: "fahrzeugbericht",
        fahrzeugId,
        ...(statusFilter !== "alle" ? { status: statusFilter } : {}),
      },
      limit: MEINE_FIND_LIMIT,
    });
    if (found.docs.length >= MEINE_FIND_LIMIT) {
      logger.warn(
        { fahrzeugId, statusFilter, limit: MEINE_FIND_LIMIT },
        "fahrzeugberichte/meine: Find-Limit erreicht — aelteste Berichte evtl. nicht beruecksichtigt",
      );
    }
    // Defensiv nachfiltern (Selektor-Semantik lokal abgesichert).
    const fzgbers = (found.docs as Array<Record<string, unknown>>).filter((d) => {
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
    // A-03a: erst nach geaendertAm absteigend kappen (die juengst
    // bearbeiteten Berichte ueberleben), dann fuer die Ausgabe wie bisher
    // nach Alarmzeit DESC sortieren — Konsumenten sehen dieselbe Ordnung.
    items.sort((a, b) => {
      const ta = new Date(a.geaendertAm ?? 0).getTime();
      const tb = new Date(b.geaendertAm ?? 0).getTime();
      return tb - ta;
    });
    const capped = items.slice(0, limit);
    capped.sort((a, b) => {
      const ta = new Date(a.alarmierungZeit ?? 0).getTime();
      const tb = new Date(b.alarmierungZeit ?? 0).getTime();
      return tb - ta;
    });
    res.json({ ok: true, items: capped });
  }),
);
