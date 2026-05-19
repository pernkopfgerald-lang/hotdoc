/**
 * PDF + Spickzettel Endpoints — FR-7, FR-8.
 */

import { Router, type RequestHandler } from "express";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { renderPdf } from "../services/pdf/generator.js";
import { renderHauptberichtHtml, renderSpickzettelHtml } from "../services/pdf/template.js";

export const pdfRouter: Router = Router();

pdfRouter.get("/api/einsaetze/:id/pdf", requireAuth(), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  try {
    const doc = (await db.get(id)) as Record<string, unknown>;
    const reaktivierungen = ((doc.reaktivierungen as Array<{ am: string; grund: string }> | undefined) ?? [])
      .map((r) => ({ am: r.am, grund: r.grund }));
    const html = renderHauptberichtHtml({
      einsatzId: id,
      einsatzart: doc.einsatzart as string | undefined,
      einsatzartFreitext: doc.einsatzartFreitext as string | undefined,
      einsatzort: String(doc.einsatzort ?? "—"),
      alarmierungZeit: String(doc.alarmierungZeit ?? ""),
      alarmierungAuthor: doc.alarmierungAuthor as string | undefined,
      einsatzTyp: (doc.einsatzTyp as "alarm" | "manuell") ?? "alarm",
      status: String(doc.status ?? ""),
      einsatzende: doc.einsatzende as string | undefined,
      meldungEinsatzleitung: doc.meldungEinsatzleitung as string | undefined,
      oelbindemittelSaecke: ((doc.oelbindemittel as { gesamtSaecke?: number } | undefined)?.gesamtSaecke) ?? 0,
      reaktivierungen,
    });
    const pdf = await renderPdf(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="einsatzbericht-${id.replace(/[^a-z0-9-]/gi, "_")}.pdf"`,
    );
    res.send(pdf);
  } catch (err) {
    logger.error({ err, id }, "PDF-Generierung fehlgeschlagen");
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    res.status(500).json({ error: "pdf_failed", message: String(err) });
  }
}) as RequestHandler);

pdfRouter.get("/api/einsaetze/:id/spickzettel", requireAuth(), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  try {
    const doc = (await db.get(id)) as Record<string, unknown>;
    const html = renderSpickzettelHtml({
      einsatzId: id,
      einsatzart: doc.einsatzart as string | undefined,
      einsatzartFreitext: doc.einsatzartFreitext as string | undefined,
      einsatzort: String(doc.einsatzort ?? "—"),
      alarmierungZeit: String(doc.alarmierungZeit ?? ""),
      alarmierungAuthor: doc.alarmierungAuthor as string | undefined,
      einsatzTyp: (doc.einsatzTyp as "alarm" | "manuell") ?? "alarm",
      status: String(doc.status ?? ""),
      oelbindemittelSaecke: ((doc.oelbindemittel as { gesamtSaecke?: number } | undefined)?.gesamtSaecke) ?? 0,
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      res.status(404).json({ error: "einsatz_not_found" });
      return;
    }
    throw err;
  }
}) as RequestHandler);
