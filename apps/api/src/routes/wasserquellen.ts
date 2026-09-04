/**
 * Löschwasser-Entnahmestellen (Hydranten, Behälter, Teiche, Saugstellen …) —
 * einmalig aus einer wasserkarte.info-KML importiert, siehe
 * services/wasserkarte-import.ts für den Hintergrund (keine Live-API).
 *
 *   GET  /api/wasserquellen              — Liste + Stand (requireAuth)
 *   GET  /api/wasserquellen/icons/:id    — Icon-PNG (OEFFENTLICH, s.u.)
 *   POST /api/wasserquellen/import       — KML hochladen, ersetzt den
 *                                           kompletten Datenbestand (Backoffice)
 *
 * Doc-Layout: wasserquelle:<id> (ein Doc pro Entnahmestelle), Icon als
 * inline `_attachments["icon.png"]` — exakt das Muster, das audio-
 * retention.ts fuer Sprachaufnahmen bereits nutzt (CouchDB-Attachments
 * sind hier kein Neuland).
 *
 * Die Icon-Route ist bewusst OHNE Auth: ein <img>/Leaflet-L.icon-Request
 * kann keinen Authorization-Header mitschicken. Die Icons selbst zeigen
 * nur ein generisches Symbol + Kennzahlen (Zufluss/Nennweite) — dieselben
 * Daten stehen bereits oeffentlich (gegen kostenlose Anmeldung) auf
 * wasserkarte.info selbst, also keine zusaetzliche Exposition. Die
 * Koordinaten + Namen bleiben ueber die JSON-Liste hinter requireAuth().
 */

import { Router } from "express";
import { z } from "zod";
import { db } from "../couch/client.js";
import { ah } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import {
  downloadIconsConcurrent,
  parseWasserkarteKml,
} from "../services/wasserkarte-import.js";

export const wasserquellenRouter: Router = Router();

const DOC_PREFIX = "wasserquelle:";

interface WasserquelleDoc {
  _id: string;
  _rev?: string;
  type: "wasserquelle";
  id: string;
  name: string;
  typ: "H" | "S" | "T";
  typLabel: string;
  anschluss: string;
  lat: number;
  lng: number;
  importBatchAt: string;
  _attachments?: Record<string, { content_type: string; data?: string; stub?: boolean }>;
}

// ─── GET /api/wasserquellen ── Liste + Stand ───────────────────────────────
wasserquellenRouter.get(
  "/api/wasserquellen",
  requireAuth(),
  ah(async (_req, res) => {
    const list = await db.list({
      startkey: DOC_PREFIX,
      endkey: `${DOC_PREFIX}￰`,
      include_docs: true,
    });
    const items = list.rows
      .map((r) => r.doc as WasserquelleDoc | undefined)
      .filter((d): d is WasserquelleDoc => !!d && d.type === "wasserquelle")
      .map((d) => ({
        id: d.id,
        name: d.name,
        typ: d.typ,
        typLabel: d.typLabel,
        anschluss: d.anschluss,
        lat: d.lat,
        lng: d.lng,
      }));
    const importedAm = items.length > 0
      ? (list.rows.find((r) => (r.doc as WasserquelleDoc | undefined)?.importBatchAt)?.doc as WasserquelleDoc | undefined)?.importBatchAt ?? null
      : null;
    res.json({ ok: true, count: items.length, importedAm, items });
  }),
);

// ─── GET /api/wasserquellen/icons/:id ── Icon-PNG (oeffentlich) ────────────
wasserquellenRouter.get(
  "/api/wasserquellen/icons/:id",
  ah(async (req, res) => {
    const id = String(req.params.id).replace(/[^a-z0-9]/gi, "");
    if (!id) {
      res.status(404).end();
      return;
    }
    try {
      const buf = (await db.attachment.get(`${DOC_PREFIX}${id}`, "icon.png")) as Buffer;
      res.set("Content-Type", "image/png");
      // Icons aendern sich nur bei einem erneuten Import — lange cachen.
      res.set("Cache-Control", "public, max-age=2592000, immutable");
      res.send(buf);
    } catch {
      res.status(404).end();
    }
  }),
);

const ImportBodySchema = z.object({
  kml: z.string().min(1).max(5_000_000),
  dateiname: z.string().max(200).optional(),
});

// ─── POST /api/wasserquellen/import ── KML hochladen, Bestand ersetzen ────
wasserquellenRouter.post(
  "/api/wasserquellen/import",
  requireAuth("funktionaer"),
  ah(async (req, res) => {
    const parsed = ImportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    const quellen = parseWasserkarteKml(parsed.data.kml);
    if (quellen.length === 0) {
      res.status(400).json({ error: "keine_wasserquellen_gefunden" });
      return;
    }

    logger.info(
      { anzahl: quellen.length, dateiname: parsed.data.dateiname, by: req.session?.username },
      "Wasserquellen-Import gestartet",
    );

    const icons = await downloadIconsConcurrent(quellen);

    // Bestehende Docs laden (fuer _rev bei Update + zum Erkennen entfernter
    // Eintraege — "vorherige Eintraege werden geloescht" ist explizit gewuenscht).
    const existing = await db.list({
      startkey: DOC_PREFIX,
      endkey: `${DOC_PREFIX}￰`,
    });
    const existingRevById = new Map<string, string>();
    for (const row of existing.rows) {
      const shortId = row.id.slice(DOC_PREFIX.length);
      existingRevById.set(shortId, row.value.rev);
    }

    const now = new Date().toISOString();
    const newIds = new Set(quellen.map((q) => q.id));
    const docs: Array<Record<string, unknown>> = [];

    for (const q of quellen) {
      const docId = `${DOC_PREFIX}${q.id}`;
      const rev = existingRevById.get(q.id);
      const iconB64 = icons.get(q.id);
      docs.push({
        _id: docId,
        ...(rev ? { _rev: rev } : {}),
        type: "wasserquelle",
        id: q.id,
        name: q.name,
        typ: q.typ,
        typLabel: q.typLabel,
        anschluss: q.anschluss,
        lat: q.lat,
        lng: q.lng,
        importBatchAt: now,
        ...(iconB64
          ? { _attachments: { "icon.png": { content_type: "image/png", data: iconB64 } } }
          : {}),
      });
    }

    // Entfernte Entnahmestellen: als geloescht markieren (Bestand wird
    // komplett durch den neuen Export ersetzt).
    let entfernt = 0;
    for (const [id, rev] of existingRevById) {
      if (newIds.has(id)) continue;
      docs.push({ _id: `${DOC_PREFIX}${id}`, _rev: rev, _deleted: true });
      entfernt += 1;
    }

    const bulkResult = await db.bulk({ docs });
    const fehler = bulkResult.filter((r: { error?: string }) => r.error).length;
    if (fehler > 0) {
      logger.warn(
        { fehler, total: docs.length },
        "Wasserquellen-Import: einzelne Docs fehlgeschlagen",
      );
    }

    const neu = quellen.length - (existingRevById.size - entfernt);
    const iconsFehlend = quellen.length - icons.size;

    logger.info(
      { anzahl: quellen.length, entfernt, iconsFehlend, fehler },
      "Wasserquellen-Import abgeschlossen",
    );

    res.json({
      ok: true,
      anzahl: quellen.length,
      entfernt,
      iconsFehlend,
      fehler,
      importedAm: now,
    });
  }),
);
