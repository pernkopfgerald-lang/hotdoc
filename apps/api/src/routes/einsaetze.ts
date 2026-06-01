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
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { EinsatzSchema, FahrzeugberichtSchema } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { writeAuditEvent } from "../services/audit.js";

export const einsaetzeRouter: Router = Router();

// ─── GET /api/einsaetze ─────────────────────────────────────
einsaetzeRouter.get("/api/einsaetze", requireAuth(), (async (req, res) => {
  const status = req.query.status as string | undefined;
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
  res.json({ ok: true, items: docs });
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
  const result = await db.insert(doc);
  logger.info({ id: doc._id, by: session.username }, "Manueller Einsatz angelegt");
  res.status(201).json({ ok: true, id: doc._id, rev: result.rev });
}) as RequestHandler);

// ─── POST /api/einsaetze/:id/abschluss ─── FR-6 ─────────────
// Mannschaft-Rolle reicht — Solo-Tablet-Einsaetze (kein Florian, nur
// ein Fahrzeug) sollen auch direkt vom Fahrzeug-Tablet abgeschlossen
// werden koennen. Die Florianstation hat ohnehin die einsatzleiter-
// Rolle und kann das jederzeit zusaetzlich. Der abschlussOverride-
// Hinweis im PDF zeigt offene Fahrzeugberichte transparent.
einsaetzeRouter.post("/api/einsaetze/:id/abschluss", requireAuth("mannschaft"), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const session = req.session!;
  const doc = (await db.get(id)) as Record<string, unknown>;
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
  const updated = {
    ...doc,
    status: "abgeschlossen",
    schreibschutz: true,
    einsatzende: new Date().toISOString(),
    bearbeiterPersonId: doc.bearbeiterPersonId,
    geaendertAm: new Date().toISOString(),
    ...(abschlussOverrideHinweis ? { abschlussOverrideHinweis } : {}),
  };
  const result = await db.insert(updated);
  logger.info({ id, by: session.username }, "Einsatz abgeschlossen");

  // F3: Cascade-Abschluss aller noch offenen Fahrzeugberichte.
  // Hintergrund: wenn der Einsatzleiter den Hauptauftrag schließt, sollen
  // KEINE in-arbeit Fahrzeugberichte mehr offen sein — die Tab-Kachel bleibt
  // sonst auf dem Fahrzeug-Tablet ewig hängen ("Geist-Tab"). Wir markieren
  // die als auto-abgeschlossen damit das PDF die Information trägt:
  // "Vom EL beim Hauptauftrag-Abschluss automatisch geschlossen".
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
      const bulkResult = await db.bulk({ docs: cascadeDocs });
      const fehlerhaft = bulkResult.filter((r) => r.error).length;
      logger.info(
        {
          id,
          cascadeCount: cascadeDocs.length,
          fehler: fehlerhaft,
        },
        "Offene Fahrzeugberichte beim Hauptauftrag-Abschluss kaskadiert geschlossen",
      );
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
    const doc = (await db.get(id)) as Record<string, unknown>;
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
        await db.bulk({ docs: cascade });
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
  // einsatzleiter (Florianstation) darf auch reaktivieren — frueher
  // war "funktionaer" Pflicht, der EL hatte keinen Zugriff.
  requireAuth("einsatzleiter"),
  (async (req, res) => {
    const id = decodeURIComponent(String(req.params.id));
    const parsed = ReaktivierenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const session = req.session!;
    const doc = (await db.get(id)) as Record<string, unknown>;
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

// ─── PUT /api/einsaetze/:id ─── Allg. Update (mit Schreibschutz-Check) ─
einsaetzeRouter.put("/api/einsaetze/:id", requireAuth(), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const current = (await db.get(id)) as Record<string, unknown>;
  if (current.schreibschutz === true) {
    res.status(423).json({ error: "schreibschutz_aktiv", hint: "Bericht muss erst reaktiviert werden (FR-14)." });
    return;
  }
  const merged = {
    ...current,
    ...req.body,
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
  const result = await db.insert(merged);
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
        fotos: [],
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
    const result = await db.insert(merged);
    res.json({ ok: true, id: docId, rev: result.rev });
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
    res.status(423).json({ error: "schreibschutz_aktiv" });
    return;
  }

  const chronik = ((doc.chronik as unknown[] | undefined) ?? []) as Array<{ id: string }>;
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
      try {
        const einsatz = (await db.get(doc.einsatzId)) as {
          einsatzart?: string;
          einsatzartFreitext?: string;
          einsatzort?: string;
          alarmierungZeit?: string;
          einsatzTyp?: string;
        };
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
      } catch {
        // Einsatz-Doc weg → Fahrzeugbericht orphan, ignorieren
      }
    }
    items.sort((a, b) => {
      const ta = new Date(a.alarmierungZeit ?? 0).getTime();
      const tb = new Date(b.alarmierungZeit ?? 0).getTime();
      return tb - ta;
    });
    res.json({ ok: true, items });
  }) as RequestHandler,
);
