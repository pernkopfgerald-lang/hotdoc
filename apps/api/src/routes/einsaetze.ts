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

// ─── POST /api/einsaetze/manuell ─── FR-12 ──────────────────
const ManuellAnlageBodySchema = z.object({
  einsatzort: z.string().min(3),
  einsatzart: z.string().optional(),
  einsatzartFreitext: z.string().optional(),
  alarmierungZeit: z.string().datetime().optional(),
  grund: z.string().optional(),
});

einsaetzeRouter.post("/api/einsaetze/manuell", requireAuth("einsatzleiter"), (async (req, res) => {
  const parsed = ManuellAnlageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const session = req.session!;
  const now = new Date().toISOString();
  const doc = {
    _id: `einsatz:manuell-${randomUUID()}`,
    type: "einsatz" as const,
    einsatzTyp: "manuell" as const,
    manuellAngelegt: {
      vonBenutzerId: session.sub,
      am: now,
      ...(parsed.data.grund ? { grund: parsed.data.grund } : {}),
    },
    einsatzort: parsed.data.einsatzort,
    alarmierungZeit: parsed.data.alarmierungZeit ?? now,
    ...(parsed.data.einsatzart ? { einsatzart: parsed.data.einsatzart } : {}),
    ...(parsed.data.einsatzartFreitext
      ? { einsatzartFreitext: parsed.data.einsatzartFreitext }
      : {}),
    zeitmarken: {},
    beteiligteStellen: [],
    sonstigeAnwesendeFF: { aktive: [] },
    mannschaft: { bereitschaft: 0, sonstige: 0 },
    verrechnung: { verrechenbar: false },
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
einsaetzeRouter.post("/api/einsaetze/:id/abschluss", requireAuth("einsatzleiter"), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  const session = req.session!;
  const doc = (await db.get(id)) as Record<string, unknown>;
  if (doc.status === "abgeschlossen") {
    res.status(409).json({ error: "already_closed" });
    return;
  }
  const updated = {
    ...doc,
    status: "abgeschlossen",
    schreibschutz: true,
    einsatzende: new Date().toISOString(),
    bearbeiterPersonId: doc.bearbeiterPersonId,
    geaendertAm: new Date().toISOString(),
  };
  const result = await db.insert(updated);
  logger.info({ id, by: session.username }, "Einsatz abgeschlossen");
  res.json({ ok: true, id, rev: result.rev });
}) as RequestHandler);

// ─── POST /api/einsaetze/:id/reaktivieren ─── FR-14 ─────────
const ReaktivierenBodySchema = z.object({
  grund: z.string().min(10, "Reaktivierungs-Grund mind. 10 Zeichen"),
});

einsaetzeRouter.post(
  "/api/einsaetze/:id/reaktivieren",
  requireAuth("funktionaer"),
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
