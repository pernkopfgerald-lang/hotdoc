/**
 * PDF + Spickzettel Endpoints — FR-7, FR-8.
 *
 * Dispatcher pro einsatzTyp:
 *   - alarm/manuell → Papier-Original-Layout (renderHauptberichtHtml)
 *   - lotsendienst  → Lotsendienst-Layout mit Verrechnungs-Block
 *   - uebung        → Übungs-Layout mit Teilnehmer-Tabelle + AS-Stunden
 */

import { Router, type RequestHandler } from "express";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { renderLotsendienstHtml, type LotsendienstDaten } from "../services/pdf/lotsendienst.js";
import { renderPdf } from "../services/pdf/generator.js";
import { renderHauptberichtHtml, renderSpickzettelHtml } from "../services/pdf/template.js";
import { renderUebungHtml, type UebungDaten, type UebungsTyp } from "../services/pdf/uebung.js";

export const pdfRouter: Router = Router();

interface PersonDoc {
  syBosId: number;
  nachname?: string;
  vorname?: string;
  dienstgrad?: string;
}

async function loadPerson(syBosId: number): Promise<PersonDoc | null> {
  try {
    return (await db.get(`person:${syBosId}`)) as PersonDoc;
  } catch {
    return null;
  }
}

async function loadFahrzeugberichte(
  einsatzId: string,
): Promise<Array<Record<string, unknown>>> {
  const prefix = `fzgber:${einsatzId.replace(/^einsatz:/, "")}:`;
  const list = await db.list({
    startkey: prefix,
    endkey: `${prefix}￰`,
    include_docs: true,
  });
  return list.rows
    .map((r) => r.doc as Record<string, unknown> | undefined)
    .filter((d): d is Record<string, unknown> => !!d && d.type === "fahrzeugbericht");
}

const FAHRZEUG_ABK: Record<string, string> = {
  kdo: "KDO",
  "tlf-a-4000": "TANK",
  "lfa-b": "LFA-B",
  mtf: "MTF",
  zentrale: "FLORIAN",
};

const FAHRZEUG_FUNKRUF: Record<string, string> = {
  kdo: "Kommando Eberstalzell",
  "tlf-a-4000": "Tank Eberstalzell",
  "lfa-b": "Pumpe Eberstalzell",
  mtf: "MTF Eberstalzell",
  zentrale: "Florian Eberstalzell",
};

pdfRouter.get("/api/einsaetze/:id/pdf", requireAuth(), (async (req, res) => {
  const id = decodeURIComponent(String(req.params.id));
  try {
    const doc = (await db.get(id)) as Record<string, unknown>;
    const einsatzTyp = (doc.einsatzTyp as string) ?? "alarm";

    let html: string;
    if (einsatzTyp === "lotsendienst") {
      html = await buildLotsendienstHtml(id, doc);
    } else if (einsatzTyp === "uebung") {
      html = await buildUebungHtml(id, doc);
    } else {
      // alarm + manuell → Papier-Original
      const reaktivierungen = (
        (doc.reaktivierungen as Array<{ am: string; grund: string }> | undefined) ?? []
      ).map((r) => ({ am: r.am, grund: r.grund }));
      html = renderHauptberichtHtml({
        einsatzId: id,
        einsatzart: doc.einsatzart as string | undefined,
        einsatzartFreitext: doc.einsatzartFreitext as string | undefined,
        einsatzort: String(doc.einsatzort ?? "—"),
        alarmierungZeit: String(doc.alarmierungZeit ?? ""),
        alarmierungAuthor: doc.alarmierungAuthor as string | undefined,
        einsatzTyp: einsatzTyp === "manuell" ? "manuell" : "alarm",
        status: String(doc.status ?? ""),
        einsatzende: doc.einsatzende as string | undefined,
        meldungEinsatzleitung: doc.meldungEinsatzleitung as string | undefined,
        oelbindemittelSaecke:
          (doc.oelbindemittel as { gesamtSaecke?: number } | undefined)?.gesamtSaecke ?? 0,
        reaktivierungen,
      });
    }

    const pdf = await renderPdf(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${einsatzTyp}-${id.replace(/[^a-z0-9-]/gi, "_")}.pdf"`,
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

/**
 * Baut die Lotsendienst-PDF-Daten zusammen. Mannschaft + Fahrzeuge kommen
 * aus den Fahrzeugbericht-Docs (falls vorhanden), KM aus dem km.gefahrenKm-
 * Feld. Wenn noch keine Fahrzeugberichte existieren (Lotsendienst frisch
 * angelegt), wird eine leere Tabelle generiert.
 */
async function buildLotsendienstHtml(
  id: string,
  doc: Record<string, unknown>,
): Promise<string> {
  const fzgBerichte = await loadFahrzeugberichte(id);

  // Mannschaft aus allen Fahrzeugberichten zusammenführen
  const allePersonenIds = new Set<number>();
  const personenList: Array<{ id: number; kdt: boolean; fahrer: boolean }> = [];
  for (const fz of fzgBerichte) {
    const m = (fz.mannschaft as Array<{ personId: number }> | undefined) ?? [];
    for (const slot of m) {
      if (slot.personId && !allePersonenIds.has(slot.personId)) {
        allePersonenIds.add(slot.personId);
        personenList.push({ id: slot.personId, kdt: false, fahrer: false });
      }
    }
    const kdt = fz.fahrzeugKdtPersonId as number | undefined;
    const fahrer = fz.fahrerPersonId as number | undefined;
    if (kdt && !allePersonenIds.has(kdt)) {
      allePersonenIds.add(kdt);
      personenList.push({ id: kdt, kdt: true, fahrer: false });
    }
    if (fahrer && !allePersonenIds.has(fahrer)) {
      allePersonenIds.add(fahrer);
      personenList.push({ id: fahrer, kdt: false, fahrer: true });
    }
  }

  const mannschaft = await Promise.all(
    personenList.map(async (p) => {
      const person = await loadPerson(p.id);
      return {
        name: person
          ? `${person.nachname ?? ""} ${person.vorname ?? ""}`.trim() || `Pers-${p.id}`
          : `Pers-${p.id}`,
        ...(person?.dienstgrad ? { rang: person.dienstgrad } : {}),
        kdt: p.kdt,
        fahrer: p.fahrer,
      };
    }),
  );

  const fahrzeuge = fzgBerichte.map((fz) => {
    const fid = (fz.fahrzeugId as string) ?? "?";
    const km = (fz.km as { gefahrenKm?: number } | undefined)?.gefahrenKm ?? 0;
    const zeit = fz.zeit as { von?: string; bis?: string } | undefined;
    return {
      abk: FAHRZEUG_ABK[fid] ?? fid.toUpperCase(),
      funkrufname: FAHRZEUG_FUNKRUF[fid] ?? fid,
      kmGefahren: km,
      ...(zeit?.von ? { zeitVon: zeit.von } : {}),
      ...(zeit?.bis ? { zeitBis: zeit.bis } : {}),
    };
  });

  // Tätigkeitsbericht aus dem ersten Fahrzeugbericht (falls Aufträge dokumentiert)
  const taetigkeitsbericht = fzgBerichte
    .map((fz) => String(fz.taetigkeitsbericht ?? "").trim())
    .filter((t) => t.length > 0)
    .join("\n\n");

  const data: LotsendienstDaten = {
    einsatzId: id,
    einsatzort: String(doc.einsatzort ?? "—"),
    alarmierungZeit: String(doc.alarmierungZeit ?? ""),
    ...(doc.einsatzende ? { einsatzende: String(doc.einsatzende) } : {}),
    auftraggeber: String(doc.lotsendienstAuftraggeber ?? "—"),
    ...(doc.lotsendienstRoute ? { route: String(doc.lotsendienstRoute) } : {}),
    verrechenbar:
      ((doc.verrechnung as { verrechenbar?: boolean } | undefined)?.verrechenbar) ?? true,
    ...((doc.verrechnung as { rechnungsadresse?: string } | undefined)?.rechnungsadresse
      ? { rechnungsadresse: (doc.verrechnung as { rechnungsadresse: string }).rechnungsadresse }
      : {}),
    mannschaft,
    fahrzeuge,
    ...(taetigkeitsbericht ? { taetigkeitsbericht } : {}),
    ...(doc.meldungEinsatzleitung
      ? { meldungEinsatzleitung: String(doc.meldungEinsatzleitung) }
      : {}),
  };
  return renderLotsendienstHtml(data);
}

async function buildUebungHtml(id: string, doc: Record<string, unknown>): Promise<string> {
  const fzgBerichte = await loadFahrzeugberichte(id);

  // Teilnehmer = alle Personen aus allen Fahrzeugberichten (Übung kann auch
  // ohne Fahrzeug erfasst werden — dann leere Liste).
  const teilnehmerMap = new Map<
    number,
    {
      id: number;
      atemschutzAktiv: boolean;
      atemschutzDauerMin: number | null;
      fahrzeugAbk: string | undefined;
    }
  >();

  for (const fz of fzgBerichte) {
    const fid = (fz.fahrzeugId as string) ?? "?";
    const abk = FAHRZEUG_ABK[fid] ?? fid.toUpperCase();
    const m = (fz.mannschaft as Array<{
      personId: number;
      atemschutzAktiv?: boolean;
      atemschutzDauerMin?: number;
    }> | undefined) ?? [];

    for (const slot of m) {
      if (!slot.personId) continue;
      const existing = teilnehmerMap.get(slot.personId);
      if (!existing) {
        teilnehmerMap.set(slot.personId, {
          id: slot.personId,
          atemschutzAktiv: !!slot.atemschutzAktiv,
          atemschutzDauerMin: typeof slot.atemschutzDauerMin === "number" ? slot.atemschutzDauerMin : null,
          fahrzeugAbk: abk,
        });
      }
    }
    const kdt = fz.fahrzeugKdtPersonId as number | undefined;
    const fahrer = fz.fahrerPersonId as number | undefined;
    if (kdt && !teilnehmerMap.has(kdt)) {
      teilnehmerMap.set(kdt, { id: kdt, atemschutzAktiv: false, atemschutzDauerMin: null, fahrzeugAbk: abk });
    }
    if (fahrer && !teilnehmerMap.has(fahrer)) {
      teilnehmerMap.set(fahrer, { id: fahrer, atemschutzAktiv: false, atemschutzDauerMin: null, fahrzeugAbk: abk });
    }
  }

  const teilnehmer = await Promise.all(
    Array.from(teilnehmerMap.values()).map(async (t) => {
      const person = await loadPerson(t.id);
      return {
        name: person
          ? `${person.nachname ?? ""} ${person.vorname ?? ""}`.trim() || `Pers-${t.id}`
          : `Pers-${t.id}`,
        ...(person?.dienstgrad ? { rang: person.dienstgrad } : {}),
        atemschutzAktiv: t.atemschutzAktiv,
        ...(t.atemschutzDauerMin !== null ? { atemschutzDauerMin: t.atemschutzDauerMin } : {}),
        ...(t.fahrzeugAbk ? { fahrzeugAbk: t.fahrzeugAbk } : {}),
      };
    }),
  );

  // Nach Nachname sortieren damit Listen reproduzierbar sind
  teilnehmer.sort((a, b) => a.name.localeCompare(b.name, "de"));

  const notizen = fzgBerichte
    .map((fz) => String(fz.taetigkeitsbericht ?? "").trim())
    .filter((t) => t.length > 0)
    .join("\n\n");

  const data: UebungDaten = {
    einsatzId: id,
    uebungThema: String(doc.uebungThema ?? doc.einsatzart ?? "Übung"),
    ...(doc.uebungsTyp ? { uebungsTyp: doc.uebungsTyp as UebungsTyp } : {}),
    ...(doc.uebungsleiter ? { uebungsleiter: String(doc.uebungsleiter) } : {}),
    einsatzort: String(doc.einsatzort ?? "—"),
    alarmierungZeit: String(doc.alarmierungZeit ?? ""),
    ...(doc.einsatzende ? { einsatzende: String(doc.einsatzende) } : {}),
    teilnehmer,
    ...(doc.meldungEinsatzleitung
      ? { meldungEinsatzleitung: String(doc.meldungEinsatzleitung) }
      : {}),
    ...(notizen ? { notizen } : {}),
  };
  return renderUebungHtml(data);
}

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
      einsatzTyp: ((doc.einsatzTyp as string) === "manuell" ? "manuell" : "alarm"),
      status: String(doc.status ?? ""),
      oelbindemittelSaecke:
        (doc.oelbindemittel as { gesamtSaecke?: number } | undefined)?.gesamtSaecke ?? 0,
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
