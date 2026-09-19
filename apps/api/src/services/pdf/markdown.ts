/**
 * Markdown-Export des Einsatzberichts (Audit 2026-09).
 *
 * Wird zusaetzlich zum PDF beim automatischen Mailversand bei Abschluss
 * mitgeschickt (routes/einsaetze.ts → sendAbschlussMail) — Zielgruppe ist
 * NICHT der Mensch am Bildschirm (dafuer gibt es das PDF), sondern
 * automatisierte Weiterverarbeitung (Scripts, Auswertung, LLM-Import). Daher
 * bewusst vollstaendig und stabil strukturiert (durchgehend gleiche
 * Ueberschriften/Feldnamen), keine Kuerzungen wie im Papier-Layout des PDFs.
 *
 * Nutzt dieselbe `BerichtDaten`-Basis wie das PDF (siehe
 * routes/pdf.ts::buildBerichtMailAnhaenge) — kein Zweit-Mapping, kein Drift.
 */

import type { BerichtDaten } from "./template.js";
import { formatDateTime } from "./_format.js";

export interface ResolvedPerson {
  name: string;
  syBosId: number;
}

export interface MarkdownExtras {
  bearbeiter?: ResolvedPerson;
  reserve: ResolvedPerson[];
}

function h2(title: string): string {
  return `\n## ${title}\n`;
}

function feld(label: string, wert: string | number | boolean | null | undefined): string {
  if (wert === null || wert === undefined || wert === "") return `- ${label}: —`;
  return `- ${label}: ${wert}`;
}

function ja(nein: boolean | null | undefined): string {
  if (nein === null || nein === undefined) return "—";
  return nein ? "Ja" : "Nein";
}

function liste(items: string[] | undefined): string {
  if (!items || items.length === 0) return "- (keine)";
  return items.map((i) => `- ${i}`).join("\n");
}

function person(p: ResolvedPerson | undefined): string {
  return p ? `${p.name} (syBOS ${p.syBosId})` : "nicht erfasst";
}

function md(s: string | undefined): string {
  // Zeilenumbrueche/Pipes in Freitext wuerden Markdown-Tabellen zerreissen —
  // Freitexte stehen deshalb NICHT in Tabellenzellen, sondern als eigener
  // Absatz (siehe Taetigkeitsbericht je Fahrzeug). Hier nur Trim + Fallback.
  const t = (s ?? "").trim();
  return t.length > 0 ? t : "(kein Text)";
}

/**
 * Baut den vollstaendigen Markdown-Export. `doc` wird nur fuer Felder
 * gebraucht, die NICHT Teil von `BerichtDaten` sind (reservePersonIds/
 * bearbeiterPersonId leben am Einsatz-Doc, nicht im PDF-Datenmodell) —
 * die Namensaufloesung dafuer passiert VOR dem Aufruf in `extra`.
 */
export function renderBerichtMarkdown(d: BerichtDaten, extra: MarkdownExtras): string {
  const isUebung = d.istUebung === true;
  const isLotsen = d.istLotsendienst === true;
  const isSpezial = isUebung || isLotsen;

  const teile: string[] = [];

  teile.push(`# Einsatzbericht ${d.berichtsNummer ?? d.einsatzId}`);
  teile.push(
    `_Automatisch generierter Markdown-Export — Datenbasis identisch zum PDF-Anhang. Erzeugt: ${formatDateTime(new Date().toISOString())}._`,
  );

  teile.push(h2("Metadaten"));
  teile.push(
    [
      feld("Einsatz-ID", d.einsatzId),
      feld("Berichtsnummer", d.berichtsNummer),
      feld("Status", d.status),
      feld("Quelle", d.einsatzQuelle),
      feld("Typ", isUebung ? "uebung" : isLotsen ? "lotsendienst" : d.einsatzTyp),
      feld("Einsatzart", d.einsatzart),
      feld("Einsatzart Freitext", d.einsatzartFreitext),
      feld("Einsatzort", d.einsatzort),
      feld("Alarmierungszeit", formatDateTime(d.alarmierungZeit)),
      feld("Alarmierungszeit (ISO)", d.alarmierungZeit),
      feld("Alarmiert durch", d.alarmierungAuthor),
      feld("Einsatzende", d.einsatzende ? formatDateTime(d.einsatzende) : undefined),
      feld("Einsatzende (ISO)", d.einsatzende),
      feld("Einsatzleiter", d.einsatzleiter),
      feld("Einsatzleiter syBOS-Id", d.einsatzleiterPersonId),
      feld("Meldung Einsatzleitung", d.meldungEinsatzleitung ? md(d.meldungEinsatzleitung) : undefined),
    ].join("\n"),
  );

  if (isUebung) {
    teile.push(h2("Übung"));
    teile.push(
      [
        feld("Thema", d.uebungThema),
        feld("Übungsleiter", d.uebungsleiter),
        feld("Übungstyp", d.uebungsTyp),
      ].join("\n"),
    );
  }
  if (isLotsen) {
    teile.push(h2("Lotsendienst"));
    teile.push(
      [feld("Auftraggeber", d.lotsendienstAuftraggeber), feld("Route", d.lotsendienstRoute)].join("\n"),
    );
  }

  if (!isSpezial) {
    teile.push(h2("Einsatz-Rahmendaten"));
    teile.push(
      [
        feld("Pflichtbereich", ja(d.pflichtbereich)),
        feld("Einsatzzone Ebersz.", ja(d.einsatzzoneEzell)),
        feld("Überörtliche Hilfe", ja(d.ueberOertlicheHilfe)),
        feld("Einsatzauftrag via", d.einsatzauftragVia),
        feld("Anrufer", d.anrufer),
        feld("Anrufer-Telefon", d.anruferTel),
      ].join("\n"),
    );
  }

  teile.push(h2("Zeitmarken"));
  teile.push(
    [
      feld("Lage unter Kontrolle", d.zeitmarken?.lageUnterKontrolle ? formatDateTime(d.zeitmarken.lageUnterKontrolle) : undefined),
      feld("Brand aus", d.zeitmarken?.brandAus ? formatDateTime(d.zeitmarken.brandAus) : undefined),
      feld("Alarmstufe 2 — Zeit", d.zeitmarken?.alst2?.zeit ? formatDateTime(d.zeitmarken.alst2.zeit) : undefined),
      feld("Alarmstufe 2 — Anforderer", d.zeitmarken?.alst2?.anforderer),
      feld("Alarmstufe 3 — Zeit", d.zeitmarken?.alst3?.zeit ? formatDateTime(d.zeitmarken.alst3.zeit) : undefined),
      feld("Alarmstufe 3 — Anforderer", d.zeitmarken?.alst3?.anforderer),
    ].join("\n"),
  );

  teile.push(h2("Mannschaft — Aggregat"));
  teile.push(
    [
      feld("Eingesetzt", d.mannschaft?.eingesetzt ?? 0),
      feld("Bereitschaft", d.mannschaft?.bereitschaft ?? 0),
      feld("Sonstige", d.mannschaft?.sonstige ?? 0),
      feld("AS-Träger", d.mannschaft?.atemschutzTraeger ?? 0),
    ].join("\n"),
  );

  teile.push(h2("Sachbearbeiter & Reserve"));
  teile.push(feld("Sachbearbeiter", person(extra.bearbeiter)));
  teile.push(`- Reserve (${extra.reserve.length} Personen):`);
  teile.push(
    extra.reserve.length > 0
      ? extra.reserve.map((p) => `  - ${person(p)}`).join("\n")
      : "  - (keine)",
  );

  teile.push(h2("Beteiligte Stellen"));
  teile.push(liste(d.beteiligteStellen));

  teile.push(h2("Sonstige anwesende FF"));
  teile.push(liste(d.sonstigeAnwesendeFF));
  if (d.sonstigeFreitext) teile.push(feld("Freitext", md(d.sonstigeFreitext)));

  teile.push(h2("Ölbindemittel"));
  teile.push(feld("Säcke gesamt", d.oelbindemittelSaecke ?? 0));

  teile.push(h2("Eingesetzte Fahrzeuge"));
  if (d.eingesetzteFahrzeuge && d.eingesetzteFahrzeuge.length > 0) {
    teile.push("| Abk. | Funkrufname | km gefahren |");
    teile.push("|---|---|---|");
    for (const f of d.eingesetzteFahrzeuge) {
      teile.push(`| ${f.abk} | ${f.funkrufname} | ${f.kmGefahren} |`);
    }
  } else {
    teile.push("(keine)");
  }

  teile.push(h2("Fahrzeugberichte — Detail"));
  if (d.fahrzeugberichte && d.fahrzeugberichte.length > 0) {
    for (const fz of d.fahrzeugberichte) {
      teile.push(`\n### ${fz.abk} — ${fz.funkrufname}`);
      teile.push(
        [
          feld("Status", fz.status),
          feld("Zeit von", fz.zeitVon ? formatDateTime(fz.zeitVon) : undefined),
          feld("Zeit bis", fz.zeitBis ? formatDateTime(fz.zeitBis) : undefined),
          feld("km gefahren", fz.kmGefahren),
          feld("Fahrer", fz.fahrer),
          feld("Fahrer syBOS-Id", fz.fahrerId),
          feld("Fahrzeug-Kdt.", fz.fahrzeugKdt),
          feld("Fahrzeug-Kdt. syBOS-Id", fz.kdtId),
          feld("Ölbindemittel-Säcke", fz.oelSaecke),
        ].join("\n"),
      );
      teile.push("\nMannschaft:");
      if (fz.mannschaft.length > 0) {
        teile.push("| Name | syBOS-Id | Atemschutz | AS-Dauer (min) |");
        teile.push("|---|---|---|---|");
        for (const m of fz.mannschaft) {
          teile.push(
            `| ${m.name} | ${m.personId ?? "—"} | ${m.atemschutzAktiv ? "Ja" : "Nein"} | ${m.atemschutzDauerMin ?? "—"} |`,
          );
        }
      } else {
        teile.push("(keine Mannschaft erfasst)");
      }
      teile.push("\nGeräte:");
      teile.push(liste(fz.geraete));
      teile.push("\nTätigkeitsbericht:");
      teile.push(`> ${md(fz.taetigkeitsbericht).replace(/\n/g, "\n> ")}`);
    }
  } else {
    teile.push("(keine Fahrzeugberichte)");
  }

  teile.push(h2("Chronologie"));
  if (d.chronik && d.chronik.length > 0) {
    teile.push("| Zeit | Quelle/Fahrzeug | Text |");
    teile.push("|---|---|---|");
    for (const c of d.chronik) {
      const zeile = md(c.text).replace(/\|/g, "\\|").replace(/\n/g, " ");
      teile.push(`| ${formatDateTime(c.zeitstempel)} | ${c.funkrufname} | ${zeile} |`);
    }
  } else {
    teile.push("(keine Chronik-Einträge)");
  }

  if (d.technischeStatistik) {
    const ts = d.technischeStatistik;
    teile.push(h2("Technische Statistik"));
    teile.push(
      [
        feld("Personenrettung — Anzahl", ts.personenRettung?.anzahlPersonen),
        feld("Personenrettung — Tot", ts.personenRettung?.tot),
        feld("Personenrettung — Verletzt", ts.personenRettung?.verletzt),
        feld("Personenrettung — Unverletzt", ts.personenRettung?.unverletzt),
        feld("Tierrettung — Groß", ts.tierRettung?.gross),
        feld("Tierrettung — Klein", ts.tierRettung?.klein),
        feld("Ursache", ts.ursache),
        feld("Haupttätigkeit", ts.hauptTaetigkeit),
      ].join("\n"),
    );
    teile.push("\nWeitere Tätigkeiten:");
    teile.push(liste(ts.weitereTaetigkeiten));
    teile.push("\nGefährliche Stoffe:");
    teile.push(liste(ts.gefaehrlicheStoffe));
  }

  if (d.brandStatistik) {
    const bs = d.brandStatistik;
    teile.push(h2("Brand-Statistik"));
    teile.push(
      [
        feld("Ausmaß", bs.ausmass),
        feld("Kategorie", bs.kategorie),
        feld("Objektart 1", bs.objektart1),
        feld("Objektart 2", bs.objektart2),
        feld("Bauart", bs.bauart),
        feld("Verlauf", bs.verlauf),
        feld("Personenrettung — Anzahl", bs.personenRettung?.anzahlPersonen),
        feld("Personenrettung — Tot", bs.personenRettung?.tot),
        feld("Personenrettung — Verletzt", bs.personenRettung?.verletzt),
        feld("Personenrettung — Unverletzt", bs.personenRettung?.unverletzt),
        feld("Tierrettung — Groß", bs.tierRettung?.gross),
        feld("Tierrettung — Klein", bs.tierRettung?.klein),
      ].join("\n"),
    );
    teile.push("\nEntdeckung:");
    teile.push(liste(bs.entdeckung));
    teile.push("\nKlassen:");
    teile.push(liste(bs.klassen));
    teile.push("\nLagen:");
    teile.push(liste(bs.lagen));
  }

  if (d.reaktivierungen && d.reaktivierungen.length > 0) {
    teile.push(h2("Reaktivierungen"));
    teile.push("| Zeitpunkt | Grund |");
    teile.push("|---|---|");
    for (const r of d.reaktivierungen) {
      teile.push(`| ${formatDateTime(r.am)} | ${md(r.grund).replace(/\|/g, "\\|")} |`);
    }
  }

  if (d.abschlussOverrideHinweis) {
    teile.push(h2("Abschluss-Hinweis"));
    teile.push(`> ${md(d.abschlussOverrideHinweis)}`);
  }

  teile.push(h2("Fotos"));
  if (d.fotos && d.fotos.length > 0) {
    // Bewusst OHNE dataUrl (Base64) — die Bilddaten sind bereits im PDF
    // enthalten, der Markdown-Export bleibt so klein und gut parsebar.
    teile.push("| Foto-ID | Aufgenommen am | Aufgenommen von | Beschreibung |");
    teile.push("|---|---|---|---|");
    for (const f of d.fotos) {
      teile.push(
        `| ${f.fotoId} | ${formatDateTime(f.aufgenommenAm)} | ${f.aufgenommenVon ?? "—"} | ${f.beschreibung ? md(f.beschreibung) : "—"} |`,
      );
    }
  } else {
    teile.push("(keine Fotos)");
  }

  return teile.join("\n") + "\n";
}
