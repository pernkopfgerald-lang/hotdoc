/**
 * PDF + Spickzettel Endpoints — FR-7, FR-8.
 *
 * Dispatcher pro einsatzTyp:
 *   - alarm/manuell → Papier-Original-Layout (renderHauptberichtHtml)
 *   - lotsendienst  → Lotsendienst-Layout mit Verrechnungs-Block
 *   - uebung        → Übungs-Layout mit Teilnehmer-Tabelle + AS-Stunden
 */

import { Router, type RequestHandler } from "express";
import { deriveBerichtNrFromId } from "@hotdoc/shared";
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
import { normalizeChronikEntry } from "../services/pdf/chronik-adapter.js";
import { renderUebungHtml, type UebungDaten, type UebungsTyp } from "../services/pdf/uebung.js";
import {
  renderFahrzeugberichtHtml,
  fahrzeugAbk,
  type FahrzeugberichtDaten,
} from "../services/pdf/fahrzeugbericht.js";

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

/**
 * Mappt einsatzTyp auf ein menschen-lesbares Quellen-Label fuer den
 * PDF-Header (Issue 24). Die Quelle hilft beim spaeteren Audit, wenn
 * ein Bericht ueber Tage hinweg untersucht werden muss.
 */
function einsatzQuelleLabel(einsatzTyp: string | undefined): string {
  switch (einsatzTyp) {
    case "lotsendienst": return "Lotsendienst";
    case "uebung":       return "Übung";
    case "manuell":      return "Manuell";
    case "alarm":
    default:             return "BlaulichtSMS";
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

/**
 * Foto-Funktion (2026-06-03): lädt alle foto:-Docs eines Einsatzes und mappt
 * sie auf die schlanke Form, die der PDF-Renderer braucht (Inline-Thumbnail +
 * Foto-Anhang). Fehler werden geschluckt — fehlt der Anhang, ist das PDF
 * trotzdem gültig.
 */
async function loadFotos(
  einsatzId: string,
): Promise<NonNullable<BerichtDaten["fotos"]>> {
  const prefix = `foto:${einsatzId.replace(/^einsatz:/, "")}:`;
  try {
    const list = await db.list({ startkey: prefix, endkey: `${prefix}￰`, include_docs: true });
    return list.rows
      .map((r) => r.doc as Record<string, unknown> | undefined)
      .filter((d): d is Record<string, unknown> => !!d && d.type === "foto" && typeof d.dataUrl === "string")
      .map((d) => ({
        fotoId: String(d._id),
        dataUrl: String(d.dataUrl),
        ...(typeof d.beschreibung === "string" ? { beschreibung: d.beschreibung } : {}),
        aufgenommenAm: String(d.aufgenommenAm ?? ""),
        ...(typeof d.aufgenommenVon === "string" ? { aufgenommenVon: d.aufgenommenVon } : {}),
      }));
  } catch (err) {
    logger.warn({ err, einsatzId }, "Foto-Laden für PDF fehlgeschlagen — Anhang entfällt");
    return [];
  }
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
    berichtsNummer: deriveBerichtNrFromId(
      id,
      doc.einsatzart as string | undefined,
      doc.alarmierungZeit as string | undefined,
    ),
    einsatzQuelle: "Lotsendienst",
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

  // Chronik aus dem Einsatz-Doc — Issue #173 (v0.1.12): normalisieren auf
  // ein einheitliches Schema, damit der Renderer alte (transkript/typ) und
  // neue (text/source/funkrufname) Eintraege gleich behandeln kann.
  const chronikRoh = (doc.chronik as unknown[] | undefined) ?? [];
  const chronik = chronikRoh.map((entry) => {
    const n = normalizeChronikEntry(entry);
    return {
      zeitstempel: n.zeitstempel,
      funkrufname: n.funkrufname ?? n.fahrzeugId ?? "—",
      text: n.text,
      source: n.source,
      // Foto-Funktion (2026-06-03): fotoId durchreichen für Inline-Thumbnail.
      ...(n.fotoId ? { fotoId: n.fotoId } : {}),
    };
  });

  // Foto-Funktion (2026-06-03): alle foto:-Docs des Einsatzes laden (für
  // Inline-Thumbnails in der Chronik + Foto-Anhang-Seiten 9×12 cm).
  const fotos = await loadFotos(id);

  // Fahrzeug-Anhang-Daten mit Personen-Namen aufgeloest
  const fahrzeugberichteOut: NonNullable<BerichtDaten["fahrzeugberichte"]> = [];
  // Einsatzleiter (v0.1.15): Wird aus dem Fahrzeugbericht abgeleitet, dessen
  // Kdt als Einsatzleiter markiert ist (kdtIstEinsatzleiter). Fallback weiter
  // unten: einsatzleiterPersonId am Einsatz-Doc.
  let einsatzleiterName: string | undefined;
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
    // v0.1.15: Ist der Kdt dieses Fahrzeugs als Einsatzleiter markiert, wird
    // sein Name für die Einsatzleiter-Box im PDF gemerkt. Erster Treffer
    // gewinnt (es sollte ohnehin nur einen geben).
    if (fz.kdtIstEinsatzleiter === true && kdtName && !einsatzleiterName) {
      einsatzleiterName = `${kdtName.nachname ?? ""} ${kdtName.vorname ?? ""}`.trim();
    }
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

  // Issue 22 (Einsatz-Test 2026-06-02): Ölbindemittel-Säcke werden beim
  // Abschluss aggregiert ans Einsatz-Doc geschrieben. Fallback fuer noch
  // aktive Einsaetze ODER fuer Bestandsberichte vor v0.1.10, wo der Wert
  // im Einsatz-Doc noch 0 ist: live aus den Fahrzeugberichten summieren.
  const oelbindemittelDoc =
    (doc.oelbindemittel as { gesamtSaecke?: number } | undefined)?.gesamtSaecke ?? 0;
  const oelbindemittelAggregiert =
    oelbindemittelDoc > 0
      ? oelbindemittelDoc
      : fzgBerichte.reduce(
          (sum, fz) => sum + Number((fz.oelbindemittelSaecke as number | undefined) ?? 0),
          0,
        );

  // v0.1.15 Fallback: kein Fahrzeug-Kdt als EL markiert, aber am Einsatz-Doc
  // ist ein einsatzleiterPersonId hinterlegt (z. B. von der Florianstation).
  if (!einsatzleiterName) {
    const elPersonId = doc.einsatzleiterPersonId as number | undefined;
    if (typeof elPersonId === "number") {
      const elPerson = await loadPerson(elPersonId);
      if (elPerson) {
        einsatzleiterName = `${elPerson.nachname ?? ""} ${elPerson.vorname ?? ""}`.trim();
      }
    }
  }

  const data: BerichtDaten = {
    einsatzId: id,
    berichtsNummer: deriveBerichtNrFromId(
      id,
      doc.einsatzart as string | undefined,
      doc.alarmierungZeit as string | undefined,
    ),
    einsatzQuelle: einsatzQuelleLabel(doc.einsatzTyp as string | undefined),
    einsatzart: doc.einsatzart as string | undefined,
    einsatzartFreitext: doc.einsatzartFreitext as string | undefined,
    einsatzort: String(doc.einsatzort ?? "—"),
    alarmierungZeit: String(doc.alarmierungZeit ?? ""),
    alarmierungAuthor: doc.alarmierungAuthor as string | undefined,
    einsatzTyp: einsatzTyp === "manuell" ? "manuell" : "alarm",
    status: String(doc.status ?? ""),
    einsatzende: doc.einsatzende as string | undefined,
    ...(einsatzleiterName ? { einsatzleiter: einsatzleiterName } : {}),
    meldungEinsatzleitung: doc.meldungEinsatzleitung as string | undefined,
    oelbindemittelSaecke: oelbindemittelAggregiert,
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
      ? (doc.beteiligteStellen as string[]).filter(
          (s) => typeof s === "string" && s.trim().length > 0,
        )
      : [],
    // Issue #168 (v0.1.12): `sonstigeAnwesendeFF` kann in zwei Schemas
    // vorliegen:
    //   - ALT (pre-v0.1.10): nacktes string[]
    //   - NEU (ab v0.1.10):  { aktive: string[], sonstigeFreitext?: string }
    // Vorher: nur das NEU-Schema wurde berücksichtigt — bei ALT-Daten
    // landete im PDF ein leeres Array obwohl das Doc Werte enthielt.
    sonstigeAnwesendeFF: (() => {
      const raw = doc.sonstigeAnwesendeFF;
      if (Array.isArray(raw)) {
        return (raw as unknown[])
          .map((s) => String(s))
          .filter((s) => s.trim().length > 0);
      }
      if (raw && typeof raw === "object" && Array.isArray((raw as { aktive?: unknown }).aktive)) {
        return ((raw as { aktive: unknown[] }).aktive)
          .map((s) => String(s))
          .filter((s) => s.trim().length > 0);
      }
      return [];
    })(),
    sonstigeFreitext:
      doc.sonstigeAnwesendeFF && typeof doc.sonstigeAnwesendeFF === "object" && !Array.isArray(doc.sonstigeAnwesendeFF)
        ? (doc.sonstigeAnwesendeFF as { sonstigeFreitext?: string }).sonstigeFreitext
        : undefined,
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
    // Foto-Funktion (2026-06-03): Fotos für Inline-Thumbnail + Anhang-Seiten.
    ...(fotos.length > 0 ? { fotos } : {}),
    ...(abschlussHinweis ? { abschlussOverrideHinweis: abschlussHinweis } : {}),
    // Issue 16/17 (Einsatz-Test 2026-06-02): syBOS-Statistik-Bloecke durch-
    // reichen. Wenn das Doc keinen entsprechenden Block hat, bleibt das
    // PDF-Template-Helper still und rendert nichts.
    ...(doc.technischeStatistik
      ? { technischeStatistik: doc.technischeStatistik as BerichtDaten["technischeStatistik"] }
      : {}),
    ...(doc.brandStatistik
      ? { brandStatistik: doc.brandStatistik as BerichtDaten["brandStatistik"] }
      : {}),
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
    berichtsNummer: deriveBerichtNrFromId(
      id,
      doc.einsatzart as string | undefined,
      doc.alarmierungZeit as string | undefined,
    ),
    einsatzQuelle: "Übung",
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

// ─── GET /api/einsaetze/:id/fahrzeugbericht/:fzgId/pdf ─────────
// Eigenstaendiges Fahrzeugbericht-PDF im Original-Papier-Layout der FF
// Eberstalzell (Vorderseite Stammdaten+Mannschaft+Geraete, Rueckseite
// Taetigkeitsbericht+Einsatzchronik). Der Funktionaer kann das pro
// Fahrzeug einzeln rausziehen — z. B. als Anhang zum Hauptbericht oder
// als interne Archiv-Datei.
pdfRouter.get(
  "/api/einsaetze/:id/fahrzeugbericht/:fzgId/pdf",
  requireAuth(),
  (async (req, res) => {
    const einsatzId = decodeURIComponent(String(req.params.id));
    const fahrzeugId = decodeURIComponent(String(req.params.fzgId));
    try {
      const einsatz = (await db.get(einsatzId)) as Record<string, unknown>;
      const fzgberId = `fzgber:${einsatzId.replace(/^einsatz:/, "")}:${fahrzeugId}`;
      let fzgber: Record<string, unknown> | null = null;
      try {
        fzgber = (await db.get(fzgberId)) as Record<string, unknown>;
      } catch (err) {
        if ((err as { statusCode?: number }).statusCode !== 404) throw err;
      }
      if (!fzgber) {
        res.status(404).json({ error: "fahrzeugbericht_not_found" });
        return;
      }

      // Mannschaft + Fahrer/Kdt mit Personen-Lookup ausstatten
      const mannschaftRaw = (fzgber.mannschaft as Array<{
        slot?: number;
        personId: number;
        atemschutzAktiv?: boolean;
        atemschutzDauerMin?: number;
      }> | undefined) ?? [];
      const mannschaftResolved: FahrzeugberichtDaten["mannschaft"] = [];
      for (const slot of mannschaftRaw) {
        const p = await loadPerson(slot.personId);
        const name = p
          ? `${p.nachname ?? ""} ${p.vorname ?? ""}`.trim() || `Pers-${slot.personId}`
          : `Pers-${slot.personId}`;
        const entry: FahrzeugberichtDaten["mannschaft"][number] = {
          name,
          atemschutzAktiv: !!slot.atemschutzAktiv,
        };
        if (p?.dienstgrad) entry.rang = p.dienstgrad;
        if (
          slot.atemschutzAktiv &&
          typeof slot.atemschutzDauerMin === "number"
        ) {
          entry.atemschutzDauerMin = slot.atemschutzDauerMin;
        }
        mannschaftResolved.push(entry);
      }

      const fahrerId = fzgber.fahrerPersonId as number | undefined;
      const kdtId = fzgber.fahrzeugKdtPersonId as number | undefined;
      const fahrerPerson = fahrerId ? await loadPerson(fahrerId) : null;
      const kdtPerson = kdtId ? await loadPerson(kdtId) : null;

      // Geraete-Labels aus config:geraete aufloesen
      const geraeteRaw = (fzgber.geraete as Array<{ materialId: string }> | undefined) ?? [];
      const geraeteLabels: string[] = [];
      try {
        const geraeteCfg = (await db.get("config:geraete")) as {
          data?: { byFahrzeug?: Record<string, Array<{ id: string; bezeichnung: string }>> };
        };
        const list = geraeteCfg.data?.byFahrzeug?.[fahrzeugId] ?? [];
        const map = new Map(list.map((g) => [g.id, g.bezeichnung]));
        for (const g of geraeteRaw) {
          geraeteLabels.push(map.get(g.materialId) ?? g.materialId);
        }
      } catch {
        // Fallback: nur materialId anzeigen
        for (const g of geraeteRaw) geraeteLabels.push(g.materialId);
      }

      // Issue #173 (v0.1.12): Auch fuer den Fahrzeugbericht-PDF die Roh-
      // Chronik durch den normalisierenden Adapter ziehen, damit alte
      // Eintraege (transkript/typ) korrekt im Anhang erscheinen.
      const chronikRaw = (einsatz.chronik as unknown[] | undefined) ?? [];

      const data: FahrzeugberichtDaten = {
        einsatzId,
        berichtsNummer: deriveBerichtNrFromId(
          einsatzId,
          einsatz.einsatzart as string | undefined,
          einsatz.alarmierungZeit as string | undefined,
        ),
        einsatzQuelle: einsatzQuelleLabel(einsatz.einsatzTyp as string | undefined),
        fahrzeugId,
        abk: fahrzeugAbk(fahrzeugId),
        funkrufname: FAHRZEUG_FUNKRUF[fahrzeugId] ?? fahrzeugId,
        einsatzort: String(einsatz.einsatzort ?? "—"),
        alarmierungZeit: String(einsatz.alarmierungZeit ?? ""),
        ...(((fzgber.zeit as { bis?: string } | undefined)?.bis)
          ? { zeitBis: (fzgber.zeit as { bis: string }).bis }
          : {}),
        kmGefahren: (fzgber.km as { gefahrenKm?: number } | undefined)?.gefahrenKm ?? 0,
        ...(fahrerPerson
          ? {
              fahrer: `${fahrerPerson.nachname ?? ""} ${fahrerPerson.vorname ?? ""}`.trim(),
            }
          : {}),
        ...(kdtPerson
          ? {
              fahrzeugKdt: `${kdtPerson.nachname ?? ""} ${kdtPerson.vorname ?? ""}`.trim(),
            }
          : {}),
        mannschaft: mannschaftResolved,
        geraete: geraeteLabels,
        oelSaecke: (fzgber.oelbindemittelSaecke as number | undefined) ?? 0,
        taetigkeitsbericht: String(fzgber.taetigkeitsbericht ?? ""),
        chronik: chronikRaw.map((c) => {
          const n = normalizeChronikEntry(c);
          return {
            zeitstempel: n.zeitstempel,
            funkrufname: n.funkrufname ?? n.fahrzeugId ?? "—",
            text: n.text,
            source: n.source,
          };
        }),
        status:
          ((fzgber.status as "in_arbeit" | "abgeschlossen" | undefined) ??
            "in_arbeit"),
      };

      const html = renderFahrzeugberichtHtml(data);
      const pdf = await renderPdf(html);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="fzgber-${data.abk}-${einsatzId.replace(/[^a-z0-9-]/gi, "_")}.pdf"`,
      );
      res.send(pdf);
    } catch (err) {
      logger.error({ err, einsatzId, fahrzeugId }, "Fahrzeugbericht-PDF fehlgeschlagen");
      if ((err as { statusCode?: number }).statusCode === 404) {
        res.status(404).json({ error: "not_found" });
        return;
      }
      res.status(500).json({ error: "pdf_failed", message: String(err) });
    }
  }) as RequestHandler,
);

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
