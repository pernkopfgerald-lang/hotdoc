/**
 * PDF + Spickzettel Endpoints — FR-7, FR-8.
 *
 * Dispatcher pro einsatzTyp:
 *   - alarm/manuell → Papier-Original-Layout (renderHauptberichtHtml)
 *   - lotsendienst  → Lotsendienst-Layout mit Verrechnungs-Block
 *   - uebung        → derselbe Renderer wie der Einsatzbericht
 *                     (renderHauptberichtHtml mit istUebung=true): GRUEN als
 *                     "ÜBUNG", je-Fahrzeug-Anhangblaetter, Einsatz-only-
 *                     Bloecke ausgeblendet. Siehe buildUebungHtml.
 */

import { Router, type RequestHandler } from "express";
import { deriveBerichtNrFromId } from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { renderPdf } from "../services/pdf/generator.js";
import {
  renderHauptberichtHtml,
  renderSpickzettelHtml,
  type BerichtDaten,
} from "../services/pdf/template.js";
import { normalizeChronikEntry } from "../services/pdf/chronik-adapter.js";
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

/**
 * AUDIT-04: Toleranter Zeitmarken-Reader. Das Einsatz-Doc speichert
 * zeitmarken.lageUnterKontrolle/brandAus als ISO-STRING (einsatz.schema.ts)
 * und alst2/alst3 als Objekt mit Feld `uhrzeit` (ZeitmarkeSchema) — der
 * fruehere Reader las auf allen vier Feldern `.zeit` und lieferte damit
 * IMMER leer. Dieser Helper akzeptiert alle drei Formen (ISO-String,
 * { zeit }, { uhrzeit }), rein lesetolerant ohne Schema-Eingriff.
 */
function zeitmarkeZeit(v: unknown): string | undefined {
  if (typeof v === "string") return v || undefined;
  if (v && typeof v === "object") {
    const o = v as { zeit?: string; uhrzeit?: string };
    return o.zeit ?? o.uhrzeit ?? undefined;
  }
  return undefined;
}

/**
 * AUDIT-14 (SF-10): Geraete-Klartext-Aufloesung. Laedt das config:geraete-Doc
 * EINMAL und baut eine Label-Map fahrzeugId → (materialId → bezeichnung).
 * Wird vom Hauptbericht (vor der fzgBerichte-Schleife, NICHT pro Fahrzeug —
 * der PDF-Pfad hatte Timeout-Probleme) und vom Standalone-Fahrzeugbericht-
 * Endpoint geteilt. Fehler → leere Map, Fallback auf die Roh-materialId.
 */
async function loadGeraeteLabelMap(): Promise<Record<string, Map<string, string>>> {
  try {
    const geraeteCfg = (await db.get("config:geraete")) as {
      data?: { byFahrzeug?: Record<string, Array<{ id: string; bezeichnung: string }>> };
    };
    const byFahrzeug = geraeteCfg.data?.byFahrzeug ?? {};
    const out: Record<string, Map<string, string>> = {};
    for (const [fzgId, list] of Object.entries(byFahrzeug)) {
      out[fzgId] = new Map(list.map((g) => [g.id, g.bezeichnung]));
    }
    return out;
  } catch (err) {
    logger.warn({ err }, "config:geraete laden fehlgeschlagen — Geraete bleiben Roh-Ids");
    return {};
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
 * Lotsendienst-Bericht (2026-06-05): laeuft — wie der Übungsbericht — durch
 * DENSELBEN Renderer wie der Einsatzbericht (`renderHauptberichtHtml`), damit
 * der Lotsendienst den vollen Einsatzbericht-Charakter bekommt: Chronik,
 * je-Fahrzeug-Anhangblaetter (Mannschaft mit Funktion + Atemschutz + Geraete),
 * Foto-Anhang. Wir bauen zuerst die volle `BerichtDaten` und overlayen dann
 * die Lotsendienst-spezifischen Felder (Auftraggeber, Route). Die Einsatz-/
 * Brand-only-Bloecke (syBOS-Statistik, Pflichtbereich/Einsatzzone/ueberoert-
 * liche Hilfe, Einsatzauftrag-via, Anrufer, Brand-Zeitmarken, Einsatzart-
 * Tabelle) werden ausgeblendet. Der Verrechnungs-Block BLEIBT erhalten —
 * der Lotsendienst ist verrechenbar.
 */
async function buildLotsendienstHtml(
  id: string,
  doc: Record<string, unknown>,
): Promise<string> {
  const data = await buildBerichtDaten(id, doc);

  data.istLotsendienst = true;
  data.einsatzQuelle = "Lotsendienst";

  data.lotsendienstAuftraggeber = String(doc.lotsendienstAuftraggeber ?? "—");
  if (doc.lotsendienstRoute) {
    data.lotsendienstRoute = String(doc.lotsendienstRoute);
  }

  // Verrechnung sicherstellen: Lotsendienst ist standardmaessig verrechenbar.
  // Der Verrechnungs-Block bleibt im Renderer sichtbar (Guard `!isUebung`).
  data.verrechenbar =
    (doc.verrechnung as { verrechenbar?: boolean } | undefined)?.verrechenbar ?? true;

  // Einsatz-/Brand-only-Felder entfernen — fuer den Lotsendienst irrelevant.
  // Der Renderer guarded zusaetzlich per `isLotsendienst`/`isSpezial`, aber so
  // steht im data-Objekt auch nichts Irrefuehrendes mehr. Verrechnung NICHT
  // loeschen (siehe oben).
  delete data.technischeStatistik;
  delete data.brandStatistik;
  delete data.pflichtbereich;
  delete data.einsatzzoneEzell;
  delete data.ueberOertlicheHilfe;
  delete data.einsatzauftragVia;
  delete data.anrufer;
  delete data.anruferTel;

  return renderHauptberichtHtml(data);
}

/**
 * Baut das vollstaendige `BerichtDaten`-Objekt inklusive Anhang-Daten
 * (Chronik + Fahrzeugberichte + Fotos). Alle Einzelfelder werden aus dem
 * Einsatz-Doc gezogen, Mannschafts-Aggregate aus den Fahrzeugberichten
 * berechnet.
 *
 * Wird sowohl vom Hauptbericht (`buildHauptberichtHtml`) als auch vom
 * Übungsbericht (`buildUebungHtml`) genutzt — der Übungsbericht laeuft
 * dadurch durch denselben Renderer und bekommt die je-Fahrzeug-Anhang-
 * blaetter automatisch. Die Übungs-spezifischen Overlays + das Entfernen
 * der Einsatz-only-Felder passieren in `buildUebungHtml`.
 */
async function buildBerichtDaten(
  id: string,
  doc: Record<string, unknown>,
): Promise<BerichtDaten> {
  const einsatzTyp = (doc.einsatzTyp as string) ?? "alarm";
  const reaktivierungen = (
    (doc.reaktivierungen as Array<{ am: string; grund: string }> | undefined) ?? []
  ).map((r) => ({ am: r.am, grund: r.grund }));

  const fzgBerichte = await loadFahrzeugberichte(id);

  // AUDIT-14: Geraete-Klartext — config:geraete EINMAL laden (nicht pro
  // Fahrzeug), die Schleife unten loest materialId → bezeichnung auf.
  const geraeteLabelMap = await loadGeraeteLabelMap();

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
      // AUDIT-14: Klartext-Bezeichnung aus config:geraete — Fallback auf die
      // Roh-materialId ist Pflicht (unbekannte/gelöschte Material-Ids).
      geraete: ((fz.geraete as Array<{ materialId: string }> | undefined) ?? []).map(
        (g) => geraeteLabelMap[fid]?.get(g.materialId) ?? g.materialId,
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

  // AUDIT-04: Zeitmarken lesetolerant — das Doc speichert lageUnterKontrolle/
  // brandAus als ISO-String und alst2/alst3 als { uhrzeit, anforderer }.
  // zeitmarkeZeit (siehe oben) akzeptiert alle Formen; alst2/alst3 werden auf
  // die Template-Form { zeit, anforderer } normalisiert (template.ts liest .zeit).
  const zm = doc.zeitmarken as Record<string, unknown> | undefined;
  const lageUnterKontrolleZeit = zeitmarkeZeit(zm?.lageUnterKontrolle);
  const brandAusZeit = zeitmarkeZeit(zm?.brandAus);
  const alst2Zeit = zeitmarkeZeit(zm?.alst2);
  const alst2Anforderer = (zm?.alst2 as { anforderer?: string } | undefined)?.anforderer;
  const alst3Zeit = zeitmarkeZeit(zm?.alst3);
  const alst3Anforderer = (zm?.alst3 as { anforderer?: string } | undefined)?.anforderer;

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
    // AUDIT-11: echte Berichtsnummer vom Doc (beim Abschluss vergeben) —
    // das Derivat ist nur noch Fallback fuer Altberichte ohne Nummer.
    berichtsNummer:
      (doc.berichtNummer as string | undefined) ??
      deriveBerichtNrFromId(
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
      ...(lageUnterKontrolleZeit ? { lageUnterKontrolle: lageUnterKontrolleZeit } : {}),
      ...(brandAusZeit ? { brandAus: brandAusZeit } : {}),
      ...(zm?.alst2
        ? {
            alst2: {
              ...(alst2Zeit ? { zeit: alst2Zeit } : {}),
              ...(alst2Anforderer ? { anforderer: alst2Anforderer } : {}),
            },
          }
        : {}),
      ...(zm?.alst3
        ? {
            alst3: {
              ...(alst3Zeit ? { zeit: alst3Zeit } : {}),
              ...(alst3Anforderer ? { anforderer: alst3Anforderer } : {}),
            },
          }
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
    // AUDIT-14 (SF-02): Rechnungsadresse fuer den Verrechenbar-Block.
    ...((doc.verrechnung as { rechnungsadresse?: string } | undefined)?.rechnungsadresse
      ? {
          rechnungsadresse: (doc.verrechnung as { rechnungsadresse?: string })
            .rechnungsadresse,
        }
      : {}),
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

  return data;
}

/**
 * Baut den vollstaendigen Hauptbericht-HTML (alarm/manuell) inklusive
 * Anhang-Seiten. Duenner Wrapper um `buildBerichtDaten` + Renderer.
 */
async function buildHauptberichtHtml(
  id: string,
  doc: Record<string, unknown>,
): Promise<string> {
  return renderHauptberichtHtml(await buildBerichtDaten(id, doc));
}

/**
 * Übungsbericht (2026-06-03): laeuft durch DENSELBEN Renderer wie der
 * Einsatzbericht (`renderHauptberichtHtml`), damit die Übung den vollen
 * Charakter + die je-Fahrzeug-Anhangblaetter bekommt. Wir bauen zuerst die
 * volle `BerichtDaten` (Mannschaft je Fahrzeug, Geraete, Chronik, Fahrzeug-
 * berichte, Fotos) und overlayen dann die Übungs-spezifischen Felder. Die
 * Einsatz-only-Bloecke (syBOS-Statistik, Verrechnung, Pflichtbereich/
 * Einsatzzone/ueberoertliche Hilfe, Einsatzauftrag-via, Anrufer) werden vom
 * data-Objekt entfernt — der Renderer blendet sie zusaetzlich per
 * `istUebung`-Guard aus, doppelt haelt besser.
 */
async function buildUebungHtml(id: string, doc: Record<string, unknown>): Promise<string> {
  const data = await buildBerichtDaten(id, doc);

  data.istUebung = true;
  data.einsatzQuelle = "Übung";

  // Großer Titel/Thema: uebungThema (Fallback: einsatzart). Wird im Kopf als
  // Übungsthema-Zeile angezeigt.
  const thema = String(doc.uebungThema ?? doc.einsatzart ?? "Übung");
  data.uebungThema = thema;

  // Übungsleiter: explizit am Doc ODER der bereits ermittelte einsatzleiter
  // (Fahrzeug-Kdt mit kdtIstEinsatzleiter — bei Übungen wird der Übungsleiter
  // automatisch zum Fahrzeug-Kdt, siehe Task #155).
  if (doc.uebungsleiter) {
    data.uebungsleiter = String(doc.uebungsleiter);
  } else if (data.einsatzleiter) {
    data.uebungsleiter = data.einsatzleiter;
  }

  if (doc.uebungsTyp) {
    data.uebungsTyp = String(doc.uebungsTyp);
  }

  // Einsatz-only-Felder entfernen — fuer die Übung irrelevant und vom User
  // bewusst ausgeklammert. Der Renderer guarded zwar zusaetzlich per
  // istUebung, aber so steht im data-Objekt auch nichts Irrefuehrendes mehr.
  delete data.technischeStatistik;
  delete data.brandStatistik;
  delete data.verrechenbar;
  delete data.pflichtbereich;
  delete data.einsatzzoneEzell;
  delete data.ueberOertlicheHilfe;
  delete data.einsatzauftragVia;
  delete data.anrufer;
  delete data.anruferTel;

  return renderHauptberichtHtml(data);
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

      // Geraete-Labels aus config:geraete aufloesen — geteilter Helper
      // (AUDIT-14), Fallback auf die Roh-materialId bei unbekannten Ids.
      const geraeteRaw = (fzgber.geraete as Array<{ materialId: string }> | undefined) ?? [];
      const geraeteLabelMap = await loadGeraeteLabelMap();
      const geraeteLabels = geraeteRaw.map(
        (g) => geraeteLabelMap[fahrzeugId]?.get(g.materialId) ?? g.materialId,
      );

      // Issue #173 (v0.1.12): Auch fuer den Fahrzeugbericht-PDF die Roh-
      // Chronik durch den normalisierenden Adapter ziehen, damit alte
      // Eintraege (transkript/typ) korrekt im Anhang erscheinen.
      const chronikRaw = (einsatz.chronik as unknown[] | undefined) ?? [];

      const data: FahrzeugberichtDaten = {
        einsatzId,
        // AUDIT-11: echte Berichtsnummer vom Einsatz-Doc, Derivat nur Fallback.
        berichtsNummer:
          (einsatz.berichtNummer as string | undefined) ??
          deriveBerichtNrFromId(
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
    // AUDIT-14 (SF-12): Spickzettel typabhaengig — Uebungs-/Lotsendienst-
    // Felder + Rechnungsadresse + echte Berichtsnummer (AUDIT-11) durchreichen.
    const einsatzTyp = (doc.einsatzTyp as string) ?? "alarm";
    const rechnungsadresse = (
      doc.verrechnung as { rechnungsadresse?: string } | undefined
    )?.rechnungsadresse;
    const html = renderSpickzettelHtml({
      einsatzId: id,
      berichtsNummer:
        (doc.berichtNummer as string | undefined) ??
        deriveBerichtNrFromId(
          id,
          doc.einsatzart as string | undefined,
          doc.alarmierungZeit as string | undefined,
        ),
      einsatzart: doc.einsatzart as string | undefined,
      einsatzartFreitext: doc.einsatzartFreitext as string | undefined,
      einsatzort: String(doc.einsatzort ?? "—"),
      alarmierungZeit: String(doc.alarmierungZeit ?? ""),
      alarmierungAuthor: doc.alarmierungAuthor as string | undefined,
      einsatzTyp: einsatzTyp === "manuell" ? "manuell" : "alarm",
      status: String(doc.status ?? ""),
      oelbindemittelSaecke:
        (doc.oelbindemittel as { gesamtSaecke?: number } | undefined)?.gesamtSaecke ?? 0,
      ...(einsatzTyp === "uebung" ? { istUebung: true } : {}),
      ...(einsatzTyp === "lotsendienst" ? { istLotsendienst: true } : {}),
      ...(doc.uebungThema ? { uebungThema: String(doc.uebungThema) } : {}),
      ...(doc.uebungsTyp ? { uebungsTyp: String(doc.uebungsTyp) } : {}),
      ...(doc.uebungsleiter ? { uebungsleiter: String(doc.uebungsleiter) } : {}),
      ...(doc.lotsendienstAuftraggeber
        ? { lotsendienstAuftraggeber: String(doc.lotsendienstAuftraggeber) }
        : {}),
      ...(doc.lotsendienstRoute ? { lotsendienstRoute: String(doc.lotsendienstRoute) } : {}),
      ...(rechnungsadresse ? { rechnungsadresse } : {}),
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
