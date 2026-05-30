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
import {
  renderHauptberichtHtml,
  renderSpickzettelHtml,
  type BerichtDaten,
} from "../services/pdf/template.js";
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
      // alarm + manuell → Papier-Original mit Anhängen
      html = await buildHauptberichtHtml(id, doc);
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

/**
 * Baut den vollstaendigen Hauptbericht-HTML inklusive Anhang-Seiten
 * (Chronik + Fahrzeugberichte). Alle Einzelfelder werden aus dem Einsatz-Doc
 * gezogen, Mannschafts-Aggregate aus den Fahrzeugberichten berechnet.
 */
async function buildHauptberichtHtml(
  id: string,
  doc: Record<string, unknown>,
): Promise<string> {
  const einsatzTyp = (doc.einsatzTyp as string) ?? "alarm";
  const reaktivierungen = (
    (doc.reaktivierungen as Array<{ am: string; grund: string }> | undefined) ?? []
  ).map((r) => ({ am: r.am, grund: r.grund }));

  const fzgBerichte = await loadFahrzeugberichte(id);

  // Mannschafts-Aggregat berechnen
  let eingesetzt = 0;
  let asTrupps = 0; // Paare von Atemschutz-Personen / 2
  let asPersonen = 0;
  for (const fz of fzgBerichte) {
    const m = (fz.mannschaft as Array<{ atemschutzAktiv?: boolean }> | undefined) ?? [];
    eingesetzt += m.length;
    if (fz.fahrerPersonId) eingesetzt++;
    if (fz.fahrzeugKdtPersonId) eingesetzt++;
    for (const slot of m) if (slot.atemschutzAktiv) asPersonen++;
  }
  asTrupps = Math.floor(asPersonen / 2);
  const bereitschaft = (
    (doc.mannschaft as { bereitschaft?: number } | undefined)?.bereitschaft ?? 0
  );
  const sonstigeMan = (
    (doc.mannschaft as { sonstige?: number } | undefined)?.sonstige ?? 0
  );

  // Eingesetzte Fahrzeuge aus den Berichten
  const eingesetzteFahrzeuge = fzgBerichte.map((fz) => {
    const fid = (fz.fahrzeugId as string) ?? "?";
    return {
      abk: FAHRZEUG_ABK[fid] ?? fid.toUpperCase(),
      funkrufname: FAHRZEUG_FUNKRUF[fid] ?? fid,
      kmGefahren: (fz.km as { gefahrenKm?: number } | undefined)?.gefahrenKm ?? 0,
    };
  });

  // Chronik aus dem Einsatz-Doc
  const chronik = (
    (doc.chronik as Array<{
      zeitstempel?: string;
      funkrufname?: string;
      text?: string;
      source?: string;
    }> | undefined) ?? []
  ).map((c) => ({
    zeitstempel: c.zeitstempel ?? "",
    funkrufname: c.funkrufname ?? "—",
    text: c.text ?? "",
    source: c.source ?? "—",
  }));

  // Fahrzeug-Anhang-Daten mit Personen-Namen aufgeloest
  const fahrzeugberichteOut: NonNullable<BerichtDaten["fahrzeugberichte"]> = [];
  for (const fz of fzgBerichte) {
    const fid = (fz.fahrzeugId as string) ?? "?";
    const m = (fz.mannschaft as Array<{
      personId: number;
      atemschutzAktiv?: boolean;
      atemschutzDauerMin?: number;
    }> | undefined) ?? [];
    const mannschaftResolved: NonNullable<BerichtDaten["fahrzeugberichte"]>[number]["mannschaft"] = [];
    for (const slot of m) {
      const p = await loadPerson(slot.personId);
      const name = p
        ? `${p.nachname ?? ""} ${p.vorname ?? ""}`.trim() || `Pers-${slot.personId}`
        : `Pers-${slot.personId}`;
      mannschaftResolved.push({
        name,
        atemschutzAktiv: !!slot.atemschutzAktiv,
        ...(typeof slot.atemschutzDauerMin === "number"
          ? { atemschutzDauerMin: slot.atemschutzDauerMin }
          : {}),
      });
    }
    const fahrerId = fz.fahrerPersonId as number | undefined;
    const kdtId = fz.fahrzeugKdtPersonId as number | undefined;
    const fahrerName = fahrerId ? await loadPerson(fahrerId) : null;
    const kdtName = kdtId ? await loadPerson(kdtId) : null;
    fahrzeugberichteOut.push({
      fahrzeugId: fid,
      funkrufname: FAHRZEUG_FUNKRUF[fid] ?? fid,
      abk: FAHRZEUG_ABK[fid] ?? fid.toUpperCase(),
      status: (fz.status as "in_arbeit" | "abgeschlossen") ?? "in_arbeit",
      kmGefahren: (fz.km as { gefahrenKm?: number } | undefined)?.gefahrenKm ?? 0,
      ...(fahrerName
        ? { fahrer: `${fahrerName.nachname ?? ""} ${fahrerName.vorname ?? ""}`.trim() }
        : {}),
      ...(kdtName
        ? { fahrzeugKdt: `${kdtName.nachname ?? ""} ${kdtName.vorname ?? ""}`.trim() }
        : {}),
      mannschaft: mannschaftResolved,
      geraete: ((fz.geraete as Array<{ materialId: string }> | undefined) ?? []).map(
        (g) => g.materialId,
      ),
      oelSaecke: (fz.oelbindemittelSaecke as number | undefined) ?? 0,
      taetigkeitsbericht: String(fz.taetigkeitsbericht ?? ""),
    });
  }

  // Abschluss-Hinweis: war beim Einsatz-Abschluss schon nicht alles fertig?
  const abschlussHinweis =
    typeof doc.abschlussOverrideHinweis === "string" && doc.abschlussOverrideHinweis
      ? String(doc.abschlussOverrideHinweis)
      : undefined;

  const zeitmarkenDoc = doc.zeitmarken as
    | {
        lageUnterKontrolle?: { zeit?: string };
        brandAus?: { zeit?: string };
        alst2?: { zeit?: string; anforderer?: string };
        alst3?: { zeit?: string; anforderer?: string };
      }
    | undefined;

  const data: BerichtDaten = {
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
    pflichtbereich: (doc.pflichtbereich as boolean | null | undefined) ?? null,
    einsatzzoneEzell: (doc.einsatzzoneEzell as boolean | null | undefined) ?? null,
    ueberOertlicheHilfe: (doc.ueberOertlicheHilfe as boolean | null | undefined) ?? null,
    einsatzauftragVia: (doc.einsatzauftragVia as BerichtDaten["einsatzauftragVia"]) ?? null,
    anrufer: doc.anrufer as string | undefined,
    anruferTel: doc.anruferTel as string | undefined,
    zeitmarken: {
      ...(zeitmarkenDoc?.lageUnterKontrolle?.zeit
        ? { lageUnterKontrolle: zeitmarkenDoc.lageUnterKontrolle.zeit }
        : {}),
      ...(zeitmarkenDoc?.brandAus?.zeit
        ? { brandAus: zeitmarkenDoc.brandAus.zeit }
        : {}),
      ...(zeitmarkenDoc?.alst2
        ? { alst2: zeitmarkenDoc.alst2 }
        : {}),
      ...(zeitmarkenDoc?.alst3
        ? { alst3: zeitmarkenDoc.alst3 }
        : {}),
    },
    beteiligteStellen: Array.isArray(doc.beteiligteStellen)
      ? (doc.beteiligteStellen as string[])
      : [],
    sonstigeAnwesendeFF: Array.isArray(
      (doc.sonstigeAnwesendeFF as { aktive?: string[] } | undefined)?.aktive,
    )
      ? ((doc.sonstigeAnwesendeFF as { aktive: string[] }).aktive)
      : [],
    sonstigeFreitext:
      (doc.sonstigeAnwesendeFF as { sonstigeFreitext?: string } | undefined)?.sonstigeFreitext,
    verrechenbar:
      (doc.verrechnung as { verrechenbar?: boolean } | undefined)?.verrechenbar,
    mannschaft: {
      eingesetzt,
      bereitschaft,
      sonstige: sonstigeMan,
      atemschutzTrupps: asTrupps,
    },
    eingesetzteFahrzeuge,
    chronik,
    fahrzeugberichte: fahrzeugberichteOut,
    ...(abschlussHinweis ? { abschlussOverrideHinweis: abschlussHinweis } : {}),
  };

  return renderHauptberichtHtml(data);
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
