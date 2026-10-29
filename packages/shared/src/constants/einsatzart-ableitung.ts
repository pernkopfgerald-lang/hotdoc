/**
 * Einsatzart aus Alarmdaten ableiten (ELS-Stichwort bzw. BlaulichtSMS-Alarmtext).
 *
 * Hintergrund: Die Berichtsnummer (B26-… / T26-…) und der Abschluss-Ablauf
 * (Brand-Wizard vs. Technisch-Statistik) haengen an der Einsatzart. Ohne Einsatzart
 * galt bisher stillschweigend "technisch" — ein Brand wurde so als T26-… gefuehrt.
 *
 * Die Ableitung ist bewusst vorsichtig:
 *  - Brand wird erkannt (ELS-Code "B…" bzw. Brand-Wort im Alarmtext) und bekommt
 *    mindestens "Brand Sonstiges", mit Stichwoertern auch eine genauere Art;
 *  - Technische Einsaetze bekommen nur dann eine Art, wenn das Stichwort eindeutig
 *    ist — sonst `undefined`, und die Mannschaft muss beim Abschluss waehlen.
 * Das Ergebnis ist ein Vorschlag (`einsatzartAuto`), die Mannschaft bestaetigt/aendert ihn.
 */

import type { Einsatzart } from "./einsatzarten.js";

export interface EinsatzartQuelle {
  /** ELS-Typcode, z. B. "B1-GEB". */
  tycod?: string;
  subTycod?: string;
  /** ELS-Klartext, z. B. "Brand Gebäude". */
  typ?: string;
  sub?: string;
  /** Alarmtext (BlaulichtSMS bzw. ELS), mehrzeilig. */
  alarmText?: string;
}

function norm(s: string | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Brand-Stichwoerter, genauere Art zuerst. Reihenfolge ist wichtig (BMA vor Wohnhaus usw.). */
const BRAND_ARTEN: ReadonlyArray<readonly [RegExp, Einsatzart]> = [
  [/brandsicherheit/, "Brandsicherheitsdienst"],
  [/brandwache/, "Brandwache n. Brand"],
  [/\bbma\b|brandmelde/, "BMA"],
  [/kamin/, "Brand Kamin"],
  [/flurbrand|waldbrand|wiese|böschung|boeschung|vegetation/, "Flurbrand"],
  [/abfall|container|müll|muell/, "Brand Abfall"],
  [/kfz|pkw|lkw|fahrzeugbrand|autobrand/, "Brand KFZ"],
  [/landwirt|stall|scheune|silo|bauernhof|heustock/, "Brand Landwirtschaft"],
  [/wohnhaus|wohnung|wohnbrand|zimmerbrand/, "Brand Wohnhaus"],
  [/gewerbe|industrie|betrieb|restaurant|gastro|werkstatt|lagerhalle/, "Brand Gewerbe"],
  [/brandverdacht|rauchentwicklung|brandgeruch/, "Brandverdacht"],
];

/** Eindeutige technische Stichwoerter. Nicht Eindeutiges bleibt bewusst leer. */
const TECHNISCH_ARTEN: ReadonlyArray<readonly [RegExp, Einsatzart]> = [
  [/eingeklemmt|eingekl\./, "VU Eingekl. Per."],
  [/ölspur|oelspur|ölbinde|oelbinde/, "Ölspur"],
  [/\blift\b|aufzug/, "Lift"],
  [/türöffnung|tueroeffnung|tür öffnen/, "Türöffnung"],
  [/wespe|biene|hornisse/, "Bienen / Wespen"],
  [/überflut|ueberflut|hochwasser/, "Überflutung"],
  [/wasserschaden|wasserrohrbruch|wassergebrechen/, "Wasserschaden"],
  [/auspumpen|pumparbeiten/, "Pumparbeiten"],
  [/höhenrett|hoehenrett/, "Höhenrettungseins."],
  [/tierrettung/, "Tierrettung"],
  [/sturmschaden|\bsturm\b|umgestürzt/, "Sturm"],
];

function ersteTreffer(
  tabelle: ReadonlyArray<readonly [RegExp, Einsatzart]>,
  text: string,
): Einsatzart | undefined {
  for (const [re, art] of tabelle) if (re.test(text)) return art;
  return undefined;
}

/**
 * Die Stichwort-Zeilen des Alarmtexts: die ersten zwei Zeilen ohne reine Zahlen,
 * ohne den Teil nach "//" (Sprechgruppen). Adresszeilen kommen spaeter im Text und
 * duerfen nicht mitsuchen ("Wiesenweg" ist kein Flurbrand).
 */
function stichwortZeilen(alarmText: string | undefined): string[] {
  return (alarmText ?? "")
    .split(/\r?\n/)
    .map((z) => z.split("//")[0]!.trim())
    .filter((z) => z && !/^\d+$/.test(z))
    .slice(0, 2);
}

/** Brand-Wort in den Stichwort-Zeilen (z. B. "Brand Gebäude", "Küchenbrand …", "BMA …"). */
function textIstBrand(zeilen: string[]): boolean {
  return zeilen.some((z) => {
    const l = z.toLowerCase();
    if (/brandverletz|brandschutzbegehung|brandschutzübung|brandschutzuebung/.test(l)) return false;
    return /(^|[^a-zäöüß])bma([^a-zäöüß]|$)|[a-zäöüß]*brand[a-zäöüß]*/.test(l);
  });
}

/**
 * Liefert die abgeleitete Einsatzart oder `undefined`, wenn sie sich nicht sicher
 * bestimmen laesst.
 */
export function leiteEinsatzartAb(q: EinsatzartQuelle): Einsatzart | undefined {
  const code = (q.tycod ?? "").trim().toUpperCase();
  const zeilen = stichwortZeilen(q.alarmText);
  const stichwort = [q.tycod, q.subTycod, q.typ, q.sub, ...zeilen].map(norm).join(" \n ");

  // Der ELS-Code entscheidet die Kategorie: B… = Brand, T… = Technisch.
  const codeBrand = /^B\d/.test(code) || /^B[-\s]/.test(code);
  const codeTechnisch = /^T\d/.test(code) || /^T[-\s]/.test(code);

  const brand = codeBrand || (!codeTechnisch && (textIstBrand(zeilen) || /^brand/.test(norm(q.typ))));
  if (brand) return ersteTreffer(BRAND_ARTEN, stichwort) ?? "Brand Sonstiges";

  return ersteTreffer(TECHNISCH_ARTEN, stichwort);
}

/** Minimale Sicht auf ein Einsatz-Dokument fuer die Pflicht-Pruefung. */
export interface EinsatzartPruefDoc {
  einsatzTyp?: string;
  einsatzart?: string;
  /** true = von HotDoc aus den Alarmdaten vorgeschlagen, noch nicht von der Mannschaft bestaetigt. */
  einsatzartAuto?: boolean;
}

/** Uebungen und Lotsendienste brauchen fuer die Nummer keine gewaehlte Einsatzart. */
export function einsatzartIstPflicht(doc: EinsatzartPruefDoc): boolean {
  return doc.einsatzTyp !== "uebung" && doc.einsatzTyp !== "lotsendienst";
}

/** Fehlt die Einsatzart ganz? (Pflicht, aber nichts gesetzt.) */
export function einsatzartFehlt(doc: EinsatzartPruefDoc): boolean {
  return einsatzartIstPflicht(doc) && !(doc.einsatzart && doc.einsatzart.trim());
}

/** Muss die Mannschaft vor dem Abschluss die Einsatzart waehlen bzw. bestaetigen? */
export function einsatzartMussBestaetigtWerden(doc: EinsatzartPruefDoc): boolean {
  return einsatzartIstPflicht(doc) && (einsatzartFehlt(doc) || doc.einsatzartAuto === true);
}
