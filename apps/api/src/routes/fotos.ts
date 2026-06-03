/**
 * Foto-Funktion (2026-06-03): Upload + Liste der Einsatz-Fotos.
 *
 *   PUT /api/einsaetze/:id/fotos   — ein komprimiertes Foto ablegen (idempotent
 *                                     über die client-generierte fotoId)
 *   GET /api/einsaetze/:id/fotos   — alle Fotos eines Einsatzes (für PDF + Anzeige)
 *
 * Fotos liegen als eigene `foto:`-Docs (siehe FotoSchema), NICHT im Einsatz-
 * oder Fahrzeugbericht-Doc — so bläht der Bild-Body weder den Chronik-Sync
 * noch den Hauptbericht-Read auf. Der Upload läuft am Fahrzeug-Tablet über die
 * Offline-Request-Outbox, ist also idempotent (gleiche fotoId überschreibt).
 */

import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { FotoSchema } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const fotosRouter: Router = Router();

const FotoUploadBodySchema = z.object({
  fotoId: z.string().regex(/^foto:.+$/),
  fahrzeugId: z.string().min(1),
  dataUrl: z.string().regex(/^data:image\/(jpeg|png|webp);base64,/),
  beschreibung: z.string().max(500).optional(),
  aufgenommenAm: z.string(),
  aufgenommenVon: z.string().optional(),
});

// ─── PUT /api/einsaetze/:id/fotos ── Foto ablegen ──────────────────────────
fotosRouter.put(
  "/api/einsaetze/:id/fotos",
  requireAuth("mannschaft"),
  (async (req, res) => {
    const einsatzId = decodeURIComponent(String(req.params.id));
    const parsed = FotoUploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }
    const b = parsed.data;
    // Schreibschutz-Check über den Einsatz (analog fzgber-PUT).
    const einsatz = (await db.get(einsatzId).catch(() => null)) as
      | { schreibschutz?: boolean }
      | null;
    if (!einsatz) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    if (einsatz.schreibschutz === true) {
      res.status(423).json({ error: "schreibschutz_aktiv" });
      return;
    }

    let existing: { _rev?: string; erstelltAm?: string } | null = null;
    try {
      existing = (await db.get(b.fotoId)) as { _rev?: string; erstelltAm?: string };
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 404) throw err;
    }

    const now = new Date().toISOString();
    const doc = {
      _id: b.fotoId,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      type: "foto" as const,
      einsatzId,
      fahrzeugId: b.fahrzeugId,
      dataUrl: b.dataUrl,
      ...(b.beschreibung ? { beschreibung: b.beschreibung } : {}),
      aufgenommenAm: b.aufgenommenAm,
      ...(b.aufgenommenVon ? { aufgenommenVon: b.aufgenommenVon } : {}),
      erstelltAm: existing?.erstelltAm ?? now,
      geaendertAm: now,
    };
    const validated = FotoSchema.safeParse(doc);
    if (!validated.success) {
      res.status(400).json({ error: "schema_invalid", details: validated.error.flatten() });
      return;
    }
    // Idempotenter Upsert mit 409-Retry (analog fzgber-PUT). Gleiche fotoId
    // → Überschreiben (Outbox kann denselben Upload mehrfach schicken).
    try {
      const result = await db.insert(doc);
      res.json({ ok: true, id: b.fotoId, rev: result.rev });
      return;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode !== 409) throw err;
      try {
        const fresh = (await db.get(b.fotoId)) as { _rev: string };
        const result = await db.insert({ ...doc, _rev: fresh._rev });
        res.json({ ok: true, id: b.fotoId, rev: result.rev, retried: true });
        return;
      } catch (retryErr) {
        if ((retryErr as { statusCode?: number }).statusCode === 409) {
          res.status(409).json({ error: "conflict_retry_failed" });
          return;
        }
        throw retryErr;
      }
    }
  }) as RequestHandler,
);

// ─── GET /api/einsaetze/:id/fotos ── alle Fotos eines Einsatzes ────────────
fotosRouter.get(
  "/api/einsaetze/:id/fotos",
  requireAuth(),
  (async (req, res) => {
    const einsatzId = decodeURIComponent(String(req.params.id));
    const prefix = `foto:${einsatzId.replace(/^einsatz:/, "")}:`;
    try {
      const list = await db.list({
        startkey: prefix,
        endkey: `${prefix}￰`,
        include_docs: true,
      });
      const items = list.rows
        .map((r) => r.doc as Record<string, unknown> | undefined)
        .filter((d): d is Record<string, unknown> => !!d && d.type === "foto");
      res.json({ ok: true, items });
    } catch (err) {
      logger.error({ err, einsatzId }, "Foto-Liste fehlgeschlagen");
      res.status(500).json({ error: "list_failed" });
    }
  }) as RequestHandler,
);
