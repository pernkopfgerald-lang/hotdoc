/**
 * Verrechnung nach Feuerwehr-Tarifordnung (Backoffice).
 *
 *  GET  /api/einsaetze/:id/verrechnung          gespeicherte Eingaben + berechnetes Blatt
 *  GET  /api/einsaetze/:id/verrechnung/pdf      Verrechnungsblatt als EIGENE PDF
 *  POST /api/einsaetze/:id/verrechnung/vorschau Blatt fuer NOCH NICHT gespeicherte Eingaben
 *  PUT  /api/einsaetze/:id/verrechnung          Eingaben speichern (nur Funktionaer)
 *
 * Die Eingaben haengen als `verrechnung` am Einsatz-Doc. Sie sind bewusst NICHT
 * in der Allowlist des normalen Einsatz-PUT (Tablets duerfen keine Preise/
 * Verrechnungsarten setzen) und duerfen auch nach dem Abschluss gepflegt werden:
 * die Verrechnung ist ein nachgelagerter Verwaltungsschritt. Jede Aenderung
 * wird mit Benutzer + Zeit am Doc vermerkt und geloggt.
 */

import { Router } from "express";
import { VerrechnungEingabenSchema, type VerrechnungEingaben } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { ah } from "../lib/async-handler.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { berechneVerrechnungFuerEinsatz, buildVerrechnungPdfBuffer } from "./pdf.js";

export const verrechnungRouter: Router = Router();

type EinsatzDoc = Record<string, unknown> & { _id: string; _rev?: string };

function einsatzId(raw: unknown): string | null {
  const id = decodeURIComponent(String(raw));
  return id.startsWith("einsatz:") ? id : null;
}

async function ladeEinsatz(id: string): Promise<EinsatzDoc | null> {
  try {
    return (await db.get(id)) as EinsatzDoc;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return null;
    throw err;
  }
}

verrechnungRouter.get("/api/einsaetze/:id/verrechnung", requireAuth(), ah(async (req, res) => {
  const id = einsatzId(req.params.id);
  if (!id) return void res.status(400).json({ error: "invalid_id" });
  const doc = await ladeEinsatz(id);
  if (!doc) return void res.status(404).json({ error: "not_found" });
  const ergebnis = await berechneVerrechnungFuerEinsatz(id, doc);
  res.json({ ok: true, eingaben: (doc.verrechnung as VerrechnungEingaben | undefined) ?? {}, ergebnis });
}));

verrechnungRouter.get("/api/einsaetze/:id/verrechnung/pdf", requireAuth(), ah(async (req, res) => {
  const id = einsatzId(req.params.id);
  if (!id) return void res.status(400).json({ error: "invalid_id" });
  const doc = await ladeEinsatz(id);
  if (!doc) return void res.status(404).json({ error: "not_found" });
  const pdf = await buildVerrechnungPdfBuffer(id, doc);
  if (!pdf) return void res.status(404).json({ error: "keine_verrechnung", hint: "Uebungen werden nicht verrechnet." });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Verrechnungsblatt-${id.replace(/[^a-z0-9-]/gi, "_")}.pdf"`);
  res.send(pdf);
}));

verrechnungRouter.post("/api/einsaetze/:id/verrechnung/vorschau", requireAuth("funktionaer"), ah(async (req, res) => {
  const id = einsatzId(req.params.id);
  if (!id) return void res.status(400).json({ error: "invalid_id" });
  const parsed = VerrechnungEingabenSchema.safeParse(req.body?.eingaben ?? {});
  if (!parsed.success) {
    return void res.status(400).json({ error: "invalid_eingaben", issues: parsed.error.issues.slice(0, 5) });
  }
  const doc = await ladeEinsatz(id);
  if (!doc) return void res.status(404).json({ error: "not_found" });
  const ergebnis = await berechneVerrechnungFuerEinsatz(id, doc, parsed.data as VerrechnungEingaben);
  res.json({ ok: true, ergebnis });
}));

verrechnungRouter.put("/api/einsaetze/:id/verrechnung", requireAuth("funktionaer"), ah(async (req, res) => {
  const id = einsatzId(req.params.id);
  if (!id) return void res.status(400).json({ error: "invalid_id" });
  const parsed = VerrechnungEingabenSchema.safeParse(req.body?.eingaben ?? {});
  if (!parsed.success) {
    return void res.status(400).json({ error: "invalid_eingaben", issues: parsed.error.issues.slice(0, 5) });
  }
  const eingaben: VerrechnungEingaben = {
    ...(parsed.data as VerrechnungEingaben),
    geaendertAm: new Date().toISOString(),
    geaendertVon: req.session?.username ?? "unbekannt",
  };

  // Bis zu 3 Versuche bei Revisions-Konflikt (parallele Tablet-Updates am Doc).
  for (let versuch = 0; versuch < 3; versuch++) {
    const doc = await ladeEinsatz(id);
    if (!doc) return void res.status(404).json({ error: "not_found" });
    const neu = { ...doc, verrechnung: eingaben };
    try {
      await db.insert(neu);
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 409 && versuch < 2) continue;
      throw err;
    }
    logger.info({ id, art: eingaben.art, by: eingaben.geaendertVon }, "Verrechnung gespeichert");
    const ergebnis = await berechneVerrechnungFuerEinsatz(id, neu);
    return void res.json({ ok: true, eingaben, ergebnis });
  }
  res.status(409).json({ error: "conflict" });
}));
