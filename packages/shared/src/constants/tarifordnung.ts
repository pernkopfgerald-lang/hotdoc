/**
 * Feuerwehr-Tarifordnung 2026 (Oö. Landes-Feuerwehrverband, Richtlinie 6.3.006,
 * Beschluss LFL 18.11.2025, in Kraft ab 01.01.2026) — Anlage I, Tarif A bis E.
 *
 * Quelle: "6.3.006_RL_Feuerwehr-Tarifordnung 2026". Die Positionsnummern und
 * Beträge sind 1:1 aus der PDF übernommen (maschinell ausgelesen, nicht von
 * Hand abgetippt). Beträge in EURO, ohne USt (§ 2 Abs. 3 UStG: nicht umsatz-
 * steuerpflichtig).
 *
 * Spalten der Anlage I:
 *  - "je Std."                 → satzStunde
 *  - "Pauschaltarif 5-12 Std." (Pkt. 2 u. 4) bzw. "Tagessatz 5-24 Std."
 *                              → satzPauschal (Zeitraum: pauschalZeitraumStd)
 *  - nur Tagessatz-Spalte befüllt → einheit "tagessatz" (festbetrag)
 *
 * Die Berechnungsregeln (Mindestverrechnung 1. Stunde, halbe Stunde, Pauschale
 * ab der 5. Stunde, Bereitstellung 60 %, am Fahrzeug verlastete Geräte) stehen
 * in utils/verrechnung.ts.
 */

export type TarifAbschnitt = "A" | "B" | "C" | "D" | "E";

export type TarifEinheit =
  /** Nur Stundensatz (z. B. Personalaufwand). */
  | "stunde"
  /** Je angefangener Viertelstunde (Kommissionsdienst, Pos. 1.03). */
  | "viertelstunde"
  /** Stundensatz + Pauschal-/Tagessatz (Fahrzeuge, Geräte). */
  | "zeit"
  /** Nur Tagessatz (je Stück/Einsatztag, Spalte "Tagessatz"). */
  | "tagessatz"
  /** Je Stück / Füllung (Pressluftflaschen). */
  | "stueck"
  /** Pauschale je Leistung (Tarif B). */
  | "pauschal"
  | "je_fahrt"
  | "je_monat"
  | "je_fall"
  /** Kein Fixpreis: Tagespreis bzw. nach Aufwand (Tarif D/E, Wohnungsöffnung …). */
  | "nach_aufwand";

export interface TarifPosition {
  /** Positionsnummer laut Anlage I, z. B. "2.04". */
  pos: string;
  /** 1–15 (Gruppen der Anlage I). */
  gruppe: number;
  bezeichnung: string;
  einheit: TarifEinheit;
  /** Stundensatz in EURO. */
  satzStunde?: number;
  /** Pauschaltarif (5–12 Std.) bzw. Tagessatz (5–24 Std.) in EURO. */
  satzPauschal?: number;
  /** Zeitraum, den der Pauschaltarif abdeckt (Std.): Pkt. 2 u. 4 = 12, sonst 24. */
  pauschalZeitraumStd?: 12 | 24;
  /** Festbetrag (Tagessatz, je Stück, Pauschale, je Fahrt/Monat/Fall). */
  festbetrag?: number;
  /** Mindestbetrag bei Verrechnung "nach Aufwand". */
  mindestbetrag?: number;
  hinweis?: string;
}

export const TARIF_GRUPPEN: Readonly<Record<number, string>> = {
  1: "Mannschaft",
  2: "Fahrzeuge und Anhänger",
  3: "Löschgeräte, Schläuche und Zubehör, Leitern",
  4: "Geräte mit motorischem Antrieb",
  5: "Atemschutzgeräte",
  6: "Werkzeuge u. sonstige Einsatzgeräte",
  7: "Persönliche Ausrüstung – Schutzbekleidung",
  8: "Wasserdienst",
  9: "Kommunikationseinrichtungen",
  10: "Heuwehrgeräte",
  11: "Einsatzgeräte für gefährliche Stoffe",
  12: "Pauschalierte Einsatzleistungen",
  13: "Brandmeldeanlagen",
  14: "Verbrauchsmaterialien",
  15: "Leistungen und Beistellungen Dritter",
};

export function tarifAbschnitt(gruppe: number): TarifAbschnitt {
  if (gruppe <= 11) return "A";
  if (gruppe === 12) return "B";
  if (gruppe === 13) return "C";
  if (gruppe === 14) return "D";
  return "E";
}

export const TARIFORDNUNG_JAHR = 2026;
export const TARIFORDNUNG_STAND = "Beschluss LFL 18.11.2025, in Kraft ab 01.01.2026";

export const TARIFORDNUNG_2026: ReadonlyArray<TarifPosition> = [
  { pos: "1.01", gruppe: 1, bezeichnung: "Personalaufwand pro Person und Stunde", einheit: "stunde", satzStunde: 34.4 },
  { pos: "1.02", gruppe: 1, bezeichnung: "Bei Messe-, Zirkus-, Theater- und sonstigen Veranstaltungen pro Person und Stunde", einheit: "stunde", satzStunde: 34.4 },
  { pos: "1.03", gruppe: 1, bezeichnung: "Kommissionsdienst von Mitgliedern der Feuerwehr (zB für feuerpolizeiliche Überprüfungen, vidieren von Brandschutzplänen usw.) pro Person und angefangener Viertelstunde", einheit: "viertelstunde", satzStunde: 18.3, hinweis: "lt. Rauchfangkehrer-Höchsttarifverordnung; aktuell 18,30 je angefangener Viertelstunde" },
  { pos: "1.04", gruppe: 1, bezeichnung: "Sachverständigentätigkeit durch Kommandanten bzw. bestellten Vertreter, Beauftragte oder Organe des LFV (zB für Bauverhandlungen, Bauplatzerklärungen und dgl.) pro Person und Stunde", einheit: "stunde", satzStunde: 112.5 },
  { pos: "2.01", gruppe: 2, bezeichnung: "Fahrzeuge bis 3,5 t Gesamtgewicht (ausgenommen Sonderfahrzeuge)", einheit: "zeit", satzStunde: 67.7, satzPauschal: 338.5, pauschalZeitraumStd: 12 },
  { pos: "2.02", gruppe: 2, bezeichnung: "Fahrzeuge >3,5 bis 5,5 t Gesamtgewicht (ausgenommen Sonderfahrzeuge)", einheit: "zeit", satzStunde: 96.5, satzPauschal: 482.5, pauschalZeitraumStd: 12 },
  { pos: "2.03", gruppe: 2, bezeichnung: "Fahrzeuge >5,5 bis 7,5 t Gesamtgewicht (ausgenommen Sonderfahrzeuge)", einheit: "zeit", satzStunde: 113.7, satzPauschal: 568.5, pauschalZeitraumStd: 12 },
  { pos: "2.04", gruppe: 2, bezeichnung: "Fahrzeuge >7,5 bis 16 t Gesamtgewicht (ausgenommen Sonderfahrzeuge)", einheit: "zeit", satzStunde: 129.8, satzPauschal: 649.0, pauschalZeitraumStd: 12 },
  { pos: "2.05", gruppe: 2, bezeichnung: "Fahrzeuge >16 bis 18 t Gesamtgewicht (ausgenommen Sonderfahrzeuge)", einheit: "zeit", satzStunde: 145.8, satzPauschal: 729.0, pauschalZeitraumStd: 12 },
  { pos: "2.06", gruppe: 2, bezeichnung: "Wechselladefahrzeug ohne Kran", einheit: "zeit", satzStunde: 145.8, satzPauschal: 729.0, pauschalZeitraumStd: 12 },
  { pos: "2.07", gruppe: 2, bezeichnung: "Drehleiter DL(K) 18, DL(K) 25", einheit: "zeit", satzStunde: 170.0, satzPauschal: 850.0, pauschalZeitraumStd: 12 },
  { pos: "2.08", gruppe: 2, bezeichnung: "Drehleiter DL(K) 30, Teleskopmastbühne, Gelenkbühne", einheit: "zeit", satzStunde: 255.0, satzPauschal: 1275.0, pauschalZeitraumStd: 12 },
  { pos: "2.09", gruppe: 2, bezeichnung: "Gefährliche-Stoffe-Fahrzeug (GSF), Abrollbehälter Gefährliche Stoffe mit Wechselladefahrzeug, Abrollbehälter Dekontamination mit Wechselladerfahrzeug, Dekontaminationsanhänger mit LKW", einheit: "zeit", satzStunde: 288.3, satzPauschal: 1441.5, pauschalZeitraumStd: 12 },
  { pos: "2.10", gruppe: 2, bezeichnung: "Öleinsatzfahrzeug, Abrollbehälter Öl mit Wechselladerfahrzeug, Rollcontainer OEF mit Transportfahrzeug", einheit: "zeit", satzStunde: 264.2, satzPauschal: 1321.0, pauschalZeitraumStd: 12 },
  { pos: "2.11", gruppe: 2, bezeichnung: "Atemschutzfahrzeug, Atemluftfahrzeug, Tauchfahrzeug", einheit: "zeit", satzStunde: 243.5, satzPauschal: 1217.5, pauschalZeitraumStd: 12 },
  { pos: "2.12", gruppe: 2, bezeichnung: "Universallöschfahrzeug, Großtanklöschfahrzeug", einheit: "zeit", satzStunde: 210.2, satzPauschal: 1051.0, pauschalZeitraumStd: 12 },
  { pos: "2.13", gruppe: 2, bezeichnung: "Rüstfahrzeug (ohne Kran), LKW mit Kran bis 100 kN Hubkraft", einheit: "zeit", satzStunde: 158.5, satzPauschal: 792.5, pauschalZeitraumStd: 12 },
  { pos: "2.14", gruppe: 2, bezeichnung: "(Schweres) Rüstfahrzeug mit Kran (SRF-K), LKW oder WLF mit Kran >100 kN bis 300 kN Hubkraft", einheit: "zeit", satzStunde: 193.0, satzPauschal: 965.0, pauschalZeitraumStd: 12 },
  { pos: "2.15", gruppe: 2, bezeichnung: "Kranfahrzeug (KF), LKW oder WLF mit Kran >300 kN Hubkraft", einheit: "zeit", satzStunde: 321.7, satzPauschal: 1608.5, pauschalZeitraumStd: 12 },
  { pos: "2.16", gruppe: 2, bezeichnung: "Abrollbehälter mit Ladelift", einheit: "zeit", satzStunde: 47.1, satzPauschal: 235.5, pauschalZeitraumStd: 12 },
  { pos: "2.17", gruppe: 2, bezeichnung: "Abrollbehälter Mulde/Bergung", einheit: "zeit", satzStunde: 31.0, satzPauschal: 155.0, pauschalZeitraumStd: 12 },
  { pos: "2.18", gruppe: 2, bezeichnung: "Überwachungseinrichtung zu Abrollbehälter Mulde/Bergung", einheit: "zeit", satzStunde: 28.7, satzPauschal: 143.5, pauschalZeitraumStd: 12 },
  { pos: "2.19", gruppe: 2, bezeichnung: "Abrollbehälter Einsatzleitung, Versorgung, FMD, Sanitär", einheit: "zeit", satzStunde: 62.0, satzPauschal: 310.0, pauschalZeitraumStd: 12 },
  { pos: "2.20", gruppe: 2, bezeichnung: "Teleskoplader inkl. Anbaugeräte", einheit: "zeit", satzStunde: 113.7, satzPauschal: 568.5, pauschalZeitraumStd: 12 },
  { pos: "2.21", gruppe: 2, bezeichnung: "Anhänger bis 750 kg Nutzlast", einheit: "zeit", satzStunde: 18.3, satzPauschal: 91.5, pauschalZeitraumStd: 12 },
  { pos: "2.22", gruppe: 2, bezeichnung: "Anhänger >750 kg bis 3.500 kg Nutzlast", einheit: "zeit", satzStunde: 55.1, satzPauschal: 275.5, pauschalZeitraumStd: 12 },
  { pos: "2.23", gruppe: 2, bezeichnung: "LKW-Anhänger >3.500 kg Nutzlast", einheit: "zeit", satzStunde: 80.4, satzPauschal: 402.0, pauschalZeitraumStd: 12 },
  { pos: "2.24", gruppe: 2, bezeichnung: "Tunnellüfter", einheit: "zeit", satzStunde: 79.2, satzPauschal: 396.0, pauschalZeitraumStd: 12 },
  { pos: "2.25", gruppe: 2, bezeichnung: "Löschunterstützungsfahrzeug (LUF) inkl. Anhänger", einheit: "zeit", satzStunde: 114.9, satzPauschal: 574.5, pauschalZeitraumStd: 12 },
  { pos: "2.26", gruppe: 2, bezeichnung: "Drohne bis Klasse C2", einheit: "zeit", satzStunde: 45.9, satzPauschal: 229.5, pauschalZeitraumStd: 12 },
  { pos: "2.27", gruppe: 2, bezeichnung: "Drohne ab Klasse C3", einheit: "zeit", satzStunde: 60.8, satzPauschal: 304.0, pauschalZeitraumStd: 12 },
  { pos: "3.01", gruppe: 3, bezeichnung: "Einstellspritze, Kübelspritze, Feuerpatsche, tragbare Feuerlöscher (Lösch- und Treibmittel nach Tarif D)", einheit: "tagessatz", festbetrag: 9.1 },
  { pos: "3.02", gruppe: 3, bezeichnung: "Trockenlöschgerät P 50 (Lösch- und Treibmittel nach Tarif D)", einheit: "zeit", satzStunde: 17.2, satzPauschal: 86.0, pauschalZeitraumStd: 24 },
  { pos: "3.03", gruppe: 3, bezeichnung: "Trockenlöschgerät TroLA 250 (Lösch- und Treibmittel nach Tarif D)", einheit: "zeit", satzStunde: 22.9, satzPauschal: 114.5, pauschalZeitraumStd: 24 },
  { pos: "3.04", gruppe: 3, bezeichnung: "Wasserführende Armaturen, Schläuche und Zubehör, je Stück", einheit: "tagessatz", festbetrag: 12.5 },
  { pos: "3.05", gruppe: 3, bezeichnung: "Fahrbare Schiebleiter (nicht hydraulisch)", einheit: "zeit", satzStunde: 35.5, satzPauschal: 177.5, pauschalZeitraumStd: 24 },
  { pos: "3.06", gruppe: 3, bezeichnung: "Tragbare Schiebleiter, Steckleiter, Rettungsplattform", einheit: "zeit", satzStunde: 11.4, satzPauschal: 57.0, pauschalZeitraumStd: 24 },
  { pos: "4.01", gruppe: 4, bezeichnung: "Handgeführte Elektro- bzw. Akkuwerkzeuge", einheit: "zeit", satzStunde: 22.9, satzPauschal: 114.5, pauschalZeitraumStd: 12 },
  { pos: "4.02", gruppe: 4, bezeichnung: "Hochleistungslüfter - Turboventilator; Tauchpumpe <1.000 l/min; Wassersauger; Motor-Kettensäge; Benzinmotor-Trennschleifer, Ölumfüllpumpe; Leichtschaumgerät; Hochdruckreiniger", einheit: "zeit", satzStunde: 30.9, satzPauschal: 154.5, pauschalZeitraumStd: 12 },
  { pos: "4.03", gruppe: 4, bezeichnung: "Tauchpumpe 1.000 l/min bis 2.000 l/min; Auspumpaggregat und Tragkraftspritze <1.000 l/min.; Stromerzeuger <5 kVA; Kompressor für Steinbohrgerät;", einheit: "zeit", satzStunde: 41.2, satzPauschal: 206.0, pauschalZeitraumStd: 12 },
  { pos: "4.04", gruppe: 4, bezeichnung: "Tauchpumpe >2.000 l/min; Auspumpaggregat und Tragkraftspritze 1.000 bis 5.000 l/min; Stromerzeuger 5 bis 11,5 kVA;", einheit: "zeit", satzStunde: 55.1, satzPauschal: 275.5, pauschalZeitraumStd: 12 },
  { pos: "4.05", gruppe: 4, bezeichnung: "Stromerzeuger >11,5 bis 20 kVA", einheit: "zeit", satzStunde: 67.7, satzPauschal: 338.5, pauschalZeitraumStd: 12 },
  { pos: "4.06", gruppe: 4, bezeichnung: "Stromerzeuger >20 kVA bis 50 kVA", einheit: "zeit", satzStunde: 80.4, satzPauschal: 402.0, pauschalZeitraumStd: 12 },
  { pos: "4.07", gruppe: 4, bezeichnung: "Stromerzeuger >50 kVA bis 150 kVA", einheit: "zeit", satzStunde: 92.9, satzPauschal: 464.5, pauschalZeitraumStd: 12 },
  { pos: "4.08", gruppe: 4, bezeichnung: "Stromerzeuger >150 kVA", einheit: "zeit", satzStunde: 117.1, satzPauschal: 585.5, pauschalZeitraumStd: 12 },
  { pos: "4.09", gruppe: 4, bezeichnung: "Akku- / Hydraulischer Rettungssatz (einschließlich Hydraulikschere und - spreizer), ohne Stromversorgung", einheit: "zeit", satzStunde: 28.7, satzPauschal: 143.5, pauschalZeitraumStd: 12 },
  { pos: "4.10", gruppe: 4, bezeichnung: "Hochdrucklöschgeräte (zB UHPS)", einheit: "zeit", satzStunde: 37.8, satzPauschal: 189.0, pauschalZeitraumStd: 12 },
  { pos: "4.11", gruppe: 4, bezeichnung: "Auspumpaggregat >5.000 l/min", einheit: "zeit", satzStunde: 115.9, satzPauschal: 579.5, pauschalZeitraumStd: 12 },
  { pos: "5.01", gruppe: 5, bezeichnung: "Atemmaske (Filter nach Tarif D); Maske ohne Reinigung", einheit: "tagessatz", festbetrag: 18.3 },
  { pos: "5.02", gruppe: 5, bezeichnung: "Saugschlauchgerät; Druckschlauchgerät ohne Pressluftatmer (Maske hierzu jeweils ohne Reinigung)", einheit: "tagessatz", festbetrag: 34.4 },
  { pos: "5.03", gruppe: 5, bezeichnung: "Pressluftatmer, komplett (ohne Pressluft), Sauerstoffschutzgerät (ohne Sauerstoff und Alkalipatrone); Wiederbelebungsgerät (Ambu, Orospirator uä.); Sauerstoffbehandlungsgerät (ohne Sauerstoff)", einheit: "zeit", satzStunde: 29.7, satzPauschal: 148.5, pauschalZeitraumStd: 24 },
  { pos: "5.04", gruppe: 5, bezeichnung: "0,4 bis 0,6 l - 200 bar", einheit: "stueck", festbetrag: 3.4, hinweis: "je Füllung/Stück" },
  { pos: "5.05", gruppe: 5, bezeichnung: "1 bis 2 l - 200 bar", einheit: "stueck", festbetrag: 4.5, hinweis: "je Füllung/Stück" },
  { pos: "5.06", gruppe: 5, bezeichnung: "4 l - 200 bar", einheit: "stueck", festbetrag: 5.7, hinweis: "je Füllung/Stück" },
  { pos: "5.07", gruppe: 5, bezeichnung: "7 l - 200 bar", einheit: "stueck", festbetrag: 10.3, hinweis: "je Füllung/Stück" },
  { pos: "5.08", gruppe: 5, bezeichnung: "10 l - 200 bar", einheit: "stueck", festbetrag: 11.4, hinweis: "je Füllung/Stück" },
  { pos: "5.09", gruppe: 5, bezeichnung: "12 l - 200 bar", einheit: "stueck", festbetrag: 12.5, hinweis: "je Füllung/Stück" },
  { pos: "5.10", gruppe: 5, bezeichnung: "15 l - 200 bar", einheit: "stueck", festbetrag: 14.8, hinweis: "je Füllung/Stück" },
  { pos: "5.11", gruppe: 5, bezeichnung: "6 bis 7 l - 300 bar", einheit: "stueck", festbetrag: 12.5, hinweis: "je Füllung/Stück" },
  { pos: "5.12", gruppe: 5, bezeichnung: "50 l - 200 bar", einheit: "stueck", festbetrag: 47.0, hinweis: "je Füllung/Stück" },
  { pos: "5.13", gruppe: 5, bezeichnung: "50 l - 300 bar", einheit: "stueck", festbetrag: 68.9, hinweis: "je Füllung/Stück" },
  { pos: "6.01", gruppe: 6, bezeichnung: "Ab- und Aufseilgerät, Motorseilwinde", einheit: "tagessatz", festbetrag: 32.1 },
  { pos: "6.02", gruppe: 6, bezeichnung: "Autogen-Schweiß- und Schneidegerät (ohne Gas)", einheit: "zeit", satzStunde: 17.2, satzPauschal: 86.0, pauschalZeitraumStd: 24 },
  { pos: "6.03", gruppe: 6, bezeichnung: "Feldkochherd (ohne Brennstoff)", einheit: "tagessatz", festbetrag: 47.1 },
  { pos: "6.04", gruppe: 6, bezeichnung: "Flaschenzug, Greifzug komplett", einheit: "zeit", satzStunde: 17.2, satzPauschal: 86.0, pauschalZeitraumStd: 24 },
  { pos: "6.05", gruppe: 6, bezeichnung: "Kunststoffseil je 20 m", einheit: "tagessatz", festbetrag: 13.8 },
  { pos: "6.06", gruppe: 6, bezeichnung: "Hebegerät (mechanisch, Handwinde)", einheit: "tagessatz", festbetrag: 16.0 },
  { pos: "6.07", gruppe: 6, bezeichnung: "Hebekissen, Arbeitsdruck über 1 bar (Pressluft nach Verbrauch)", einheit: "zeit", satzStunde: 41.3, satzPauschal: 206.5, pauschalZeitraumStd: 24 },
  { pos: "6.08", gruppe: 6, bezeichnung: "Hebekissen, Arbeitsdruck unter 1 bar (Pressluft nach Verbrauch), Kombinations-Hebekissen NT-Serie", einheit: "zeit", satzStunde: 54.0, satzPauschal: 270.0, pauschalZeitraumStd: 24 },
  { pos: "6.09", gruppe: 6, bezeichnung: "Zelt bis 10 Personen", einheit: "tagessatz", festbetrag: 50.5 },
  { pos: "6.10", gruppe: 6, bezeichnung: "Zelt über 10 Personen", einheit: "tagessatz", festbetrag: 70.0 },
  { pos: "6.11", gruppe: 6, bezeichnung: "Wärmebildkamera", einheit: "zeit", satzStunde: 41.2, satzPauschal: 206.0, pauschalZeitraumStd: 24 },
  { pos: "6.12", gruppe: 6, bezeichnung: "Beleuchtungsgerät kabelgebunden", einheit: "zeit", satzStunde: 26.4, satzPauschal: 132.0, pauschalZeitraumStd: 24 },
  { pos: "6.13", gruppe: 6, bezeichnung: "Beleuchtungsgerät akkubetrieben", einheit: "zeit", satzStunde: 28.7, satzPauschal: 143.5, pauschalZeitraumStd: 24 },
  { pos: "6.14", gruppe: 6, bezeichnung: "Feldbett", einheit: "tagessatz", festbetrag: 6.9 },
  { pos: "6.15", gruppe: 6, bezeichnung: "Sandsackfüllgerät manuell", einheit: "zeit", satzStunde: 26.4, satzPauschal: 132.0, pauschalZeitraumStd: 24 },
  { pos: "6.16", gruppe: 6, bezeichnung: "Sandsackfüllgerät mit Motorantrieb (Gelenkwelle)", einheit: "zeit", satzStunde: 40.2, satzPauschal: 201.0, pauschalZeitraumStd: 24 },
  { pos: "7.01", gruppe: 7, bezeichnung: "Hitzeschutzanzug", einheit: "zeit", satzStunde: 20.6, satzPauschal: 103.0, pauschalZeitraumStd: 24 },
  { pos: "7.02", gruppe: 7, bezeichnung: "Hitzeschutzhandschuhe oder Hitzeschutzhaube", einheit: "tagessatz", festbetrag: 27.5 },
  { pos: "7.03", gruppe: 7, bezeichnung: "Schutzbekleidung Schutzstufe 1: Brandschutzbekleidung, Einsatzbekleidung", einheit: "nach_aufwand", hinweis: "Reinigung nach Vorgaben" },
  { pos: "7.04", gruppe: 7, bezeichnung: "Schutzbekleidung Schutzstufe 2: Teilschutzbekleidung Leichter Kontaminationsschutz (nicht gasdicht) leichter Hitzeschutz (thermische Strahlung)", einheit: "zeit", satzStunde: 41.2, satzPauschal: 206.0, pauschalZeitraumStd: 24, hinweis: "bzw. nach Aufwand" },
  { pos: "7.05", gruppe: 7, bezeichnung: "Schutzbekleidung Schutzstufe 3: Vollschutzbekleidung Schwerer Kontaminationsschutz (gasdicht) Schwerer Hitzeschutz (Flammen)", einheit: "zeit", satzStunde: 106.8, satzPauschal: 534.0, pauschalZeitraumStd: 24, hinweis: "bzw. nach Aufwand" },
  { pos: "7.06", gruppe: 7, bezeichnung: "Schnittschutzhose, Wathose", einheit: "tagessatz", festbetrag: 28.7 },
  { pos: "8.01", gruppe: 8, bezeichnung: "Anker, Ankerseil, Arbeitsleine", einheit: "tagessatz", festbetrag: 8.0 },
  { pos: "8.02", gruppe: 8, bezeichnung: "Arbeitsboot", einheit: "zeit", satzStunde: 67.7, satzPauschal: 338.5, pauschalZeitraumStd: 24 },
  { pos: "8.03", gruppe: 8, bezeichnung: "Motorzille, Schlauchboot oder Kunststoffboot, jeweils mit Motor", einheit: "zeit", satzStunde: 41.2, satzPauschal: 206.0, pauschalZeitraumStd: 24 },
  { pos: "8.04", gruppe: 8, bezeichnung: "Feuerwehrrettungsboot", einheit: "zeit", satzStunde: 64.2, satzPauschal: 321.0, pauschalZeitraumStd: 24 },
  { pos: "8.05", gruppe: 8, bezeichnung: "Rettungsring, Ruder, Schubstange", einheit: "tagessatz", festbetrag: 8.0 },
  { pos: "8.06", gruppe: 8, bezeichnung: "Schlauchboot oder Kunststoffboot, ohne Motor", einheit: "zeit", satzStunde: 16.0, satzPauschal: 80.0, pauschalZeitraumStd: 24 },
  { pos: "8.07", gruppe: 8, bezeichnung: "Rettungsweste", einheit: "zeit", satzStunde: 9.2, satzPauschal: 46.0, pauschalZeitraumStd: 24 },
  { pos: "8.08", gruppe: 8, bezeichnung: "Taucherausrüstung „nass“ komplett (exkl. Tauchgerät)", einheit: "tagessatz", festbetrag: 72.3 },
  { pos: "8.09", gruppe: 8, bezeichnung: "Taucherausrüstung „trocken“ komplett (exkl. Tauchgerät)", einheit: "tagessatz", festbetrag: 119.4 },
  { pos: "8.10", gruppe: 8, bezeichnung: "Feuerwehrzille (Holz, Kunststoff oder Alu) komplett", einheit: "zeit", satzStunde: 14.8, satzPauschal: 74.0, pauschalZeitraumStd: 24 },
  { pos: "8.11", gruppe: 8, bezeichnung: "Unterwasserkamera (ohne Boot)", einheit: "zeit", satzStunde: 80.4, satzPauschal: 402.0, pauschalZeitraumStd: 24 },
  { pos: "8.12", gruppe: 8, bezeichnung: "Unterwassersonar (ohne Boot)", einheit: "zeit", satzStunde: 64.3, satzPauschal: 321.5, pauschalZeitraumStd: 24 },
  { pos: "8.13", gruppe: 8, bezeichnung: "Unterwasserschneidegerät", einheit: "zeit", satzStunde: 47.0, satzPauschal: 235.0, pauschalZeitraumStd: 24 },
  { pos: "8.14", gruppe: 8, bezeichnung: "Eisretter", einheit: "zeit", satzStunde: 16.0, satzPauschal: 80.0, pauschalZeitraumStd: 24 },
  { pos: "8.15", gruppe: 8, bezeichnung: "Tauchgerät mit Rettungs- und Tarierweste", einheit: "zeit", satzStunde: 39.0, satzPauschal: 195.0, pauschalZeitraumStd: 24 },
  { pos: "8.16", gruppe: 8, bezeichnung: "Handgeführte Elektro- bzw. Akkuwerkzeuge für den Wasserdienst", einheit: "zeit", satzStunde: 26.4, satzPauschal: 132.0, pauschalZeitraumStd: 24 },
  { pos: "8.17", gruppe: 8, bezeichnung: "Hebeballon, Hebesack (offen oder geschlossen) inkl. Zubehör", einheit: "zeit", satzStunde: 54.0, satzPauschal: 270.0, pauschalZeitraumStd: 24 },
  { pos: "9.01", gruppe: 9, bezeichnung: "Handfunkgerät", einheit: "zeit", satzStunde: 16.0, satzPauschal: 80.0, pauschalZeitraumStd: 24 },
  { pos: "9.02", gruppe: 9, bezeichnung: "Kabelgebundenes Tauchertelefon", einheit: "zeit", satzStunde: 18.4, satzPauschal: 92.0, pauschalZeitraumStd: 24 },
  { pos: "9.03", gruppe: 9, bezeichnung: "Drahtloses Tauchertelefon", einheit: "zeit", satzStunde: 27.5, satzPauschal: 137.5, pauschalZeitraumStd: 24 },
  { pos: "9.04", gruppe: 9, bezeichnung: "Megafon (ohne Batteriekosten)", einheit: "tagessatz", festbetrag: 18.4 },
  { pos: "10.01", gruppe: 10, bezeichnung: "Heumess-Sonde", einheit: "tagessatz", festbetrag: 14.8 },
  { pos: "10.02", gruppe: 10, bezeichnung: "Heuwehrgerät komplett", einheit: "zeit", satzStunde: 27.5, satzPauschal: 137.5, pauschalZeitraumStd: 24 },
  { pos: "10.03", gruppe: 10, bezeichnung: "Heuschneider elektrisch", einheit: "zeit", satzStunde: 16.0, satzPauschal: 80.0, pauschalZeitraumStd: 24 },
  { pos: "11.01", gruppe: 11, bezeichnung: "Auffangbehälter 1000 l", einheit: "zeit", satzStunde: 14.8, satzPauschal: 74.0, pauschalZeitraumStd: 24 },
  { pos: "11.02", gruppe: 11, bezeichnung: "Auffangbehälter 2000 l", einheit: "zeit", satzStunde: 27.5, satzPauschal: 137.5, pauschalZeitraumStd: 24 },
  { pos: "11.03", gruppe: 11, bezeichnung: "Auffangbehälter 3000 l, faltbar mit Gerüst", einheit: "zeit", satzStunde: 37.8, satzPauschal: 189.0, pauschalZeitraumStd: 24 },
  { pos: "11.04", gruppe: 11, bezeichnung: "Auffangbehälter 5000 l, Kunststoff", einheit: "zeit", satzStunde: 37.8, satzPauschal: 189.0, pauschalZeitraumStd: 24 },
  { pos: "11.05", gruppe: 11, bezeichnung: "Auffangbehälter Edelstahl 300 l", einheit: "zeit", satzStunde: 14.8, satzPauschal: 74.0, pauschalZeitraumStd: 24 },
  { pos: "11.06", gruppe: 11, bezeichnung: "Edelstahlbehälter rund mit Deckel", einheit: "zeit", satzStunde: 40.2, satzPauschal: 201.0, pauschalZeitraumStd: 24 },
  { pos: "11.07", gruppe: 11, bezeichnung: "Eimer, Edelstahl 10 l", einheit: "tagessatz", festbetrag: 12.5 },
  { pos: "11.08", gruppe: 11, bezeichnung: "Kanister 50 l", einheit: "tagessatz", festbetrag: 12.5 },
  { pos: "11.09", gruppe: 11, bezeichnung: "Kunststoffwanne 50 l", einheit: "zeit", satzStunde: 7.9, satzPauschal: 39.5, pauschalZeitraumStd: 24 },
  { pos: "11.10", gruppe: 11, bezeichnung: "Kunststoffwanne 200 l", einheit: "zeit", satzStunde: 12.5, satzPauschal: 62.5, pauschalZeitraumStd: 24 },
  { pos: "11.11", gruppe: 11, bezeichnung: "Ölfass bis 200 l", einheit: "zeit", satzStunde: 7.9, satzPauschal: 39.5, pauschalZeitraumStd: 24 },
  { pos: "11.12", gruppe: 11, bezeichnung: "Behälter 220 l", einheit: "zeit", satzStunde: 12.5, satzPauschal: 62.5, pauschalZeitraumStd: 24 },
  { pos: "11.13", gruppe: 11, bezeichnung: "Falttank 3000-5000 l, im Packsack", einheit: "zeit", satzStunde: 37.8, satzPauschal: 189.0, pauschalZeitraumStd: 24 },
  { pos: "11.14", gruppe: 11, bezeichnung: "Falttank 3000-5000 l geschlossen, im Packsack", einheit: "zeit", satzStunde: 57.4, satzPauschal: 287.0, pauschalZeitraumStd: 24 },
  { pos: "11.15", gruppe: 11, bezeichnung: "Auffangrinne Edelstahl 4-teilig", einheit: "zeit", satzStunde: 10.3, satzPauschal: 51.5, pauschalZeitraumStd: 24 },
  { pos: "11.16", gruppe: 11, bezeichnung: "Auffangtrichter Edelstahl 40 x 40", einheit: "zeit", satzStunde: 10.3, satzPauschal: 51.5, pauschalZeitraumStd: 24 },
  { pos: "11.17", gruppe: 11, bezeichnung: "Kastenrinne Edelstahl", einheit: "zeit", satzStunde: 10.3, satzPauschal: 51.5, pauschalZeitraumStd: 24 },
  { pos: "11.18", gruppe: 11, bezeichnung: "Trichter, Edelstahl Durchmesser 250 mm", einheit: "tagessatz", festbetrag: 12.5 },
  { pos: "11.19", gruppe: 11, bezeichnung: "Explosimeter, Gasspürgerät (Prüfröhrchen nach Tarif D)", einheit: "tagessatz", festbetrag: 53.9 },
  { pos: "11.20", gruppe: 11, bezeichnung: "Alle übrigen Gasmessgeräte (je Gerät)", einheit: "zeit", satzStunde: 17.0, satzPauschal: 85.0, pauschalZeitraumStd: 24 },
  { pos: "11.21", gruppe: 11, bezeichnung: "Strahlenmessgerät", einheit: "zeit", satzStunde: 22.9, satzPauschal: 114.5, pauschalZeitraumStd: 24 },
  { pos: "11.22", gruppe: 11, bezeichnung: "B-Druckschlauch 20m antistatisch", einheit: "tagessatz", festbetrag: 25.2 },
  { pos: "11.23", gruppe: 11, bezeichnung: "C-Druckschlauch 15m antistatisch", einheit: "tagessatz", festbetrag: 25.2 },
  { pos: "11.24", gruppe: 11, bezeichnung: "PVC Saug- und Druckschlauch DN 50 (10m)", einheit: "tagessatz", festbetrag: 25.2 },
  { pos: "11.25", gruppe: 11, bezeichnung: "Saug- und Druckschlauch säurefest DN 32 (10m)", einheit: "tagessatz", festbetrag: 47.0 },
  { pos: "11.26", gruppe: 11, bezeichnung: "Ölsperren (je 10m)", einheit: "tagessatz", festbetrag: 153.9 },
  { pos: "11.27", gruppe: 11, bezeichnung: "Dichtkissensatz", einheit: "zeit", satzStunde: 53.9, satzPauschal: 269.5, pauschalZeitraumStd: 24 },
  { pos: "11.28", gruppe: 11, bezeichnung: "Fasspumpe Flux, ex-geschützt, mit Zubehör", einheit: "zeit", satzStunde: 37.8, satzPauschal: 189.0, pauschalZeitraumStd: 24 },
  { pos: "11.29", gruppe: 11, bezeichnung: "Handmembranpumpe Edelstahl", einheit: "zeit", satzStunde: 24.0, satzPauschal: 120.0, pauschalZeitraumStd: 24 },
  { pos: "11.30", gruppe: 11, bezeichnung: "Handumfüllpumpe", einheit: "zeit", satzStunde: 20.6, satzPauschal: 103.0, pauschalZeitraumStd: 24 },
  { pos: "11.31", gruppe: 11, bezeichnung: "Säure-Tauchpumpe, ex-geschützt", einheit: "zeit", satzStunde: 60.8, satzPauschal: 304.0, pauschalZeitraumStd: 24 },
  { pos: "11.32", gruppe: 11, bezeichnung: "Schlauchquetschpumpe, ex-geschützte Umfüllpumpe", einheit: "zeit", satzStunde: 60.8, satzPauschal: 304.0, pauschalZeitraumStd: 24 },
  { pos: "11.33", gruppe: 11, bezeichnung: "Öl-Wassersauger, samt Zubehör", einheit: "zeit", satzStunde: 40.2, satzPauschal: 201.0, pauschalZeitraumStd: 24 },
  { pos: "11.34", gruppe: 11, bezeichnung: "Öl-Wasser-Trenngerät, Ölabsauggerät", einheit: "zeit", satzStunde: 60.8, satzPauschal: 304.0, pauschalZeitraumStd: 24 },
  { pos: "11.35", gruppe: 11, bezeichnung: "Ölabscheider mobil, Ölskimmer", einheit: "zeit", satzStunde: 60.8, satzPauschal: 304.0, pauschalZeitraumStd: 24 },
  { pos: "12.01", gruppe: 12, bezeichnung: "Wohnungsöffnung", einheit: "nach_aufwand", mindestbetrag: 114.9, hinweis: "Nach Aufwand, mindestens 114,90" },
  { pos: "12.02", gruppe: 12, bezeichnung: "Brandsicherheitswachdienst bei Messe-, Zirkus-, Theater- und sonstigen Veranstaltungen, weniger als 3 Stunden, Pauschalgebühr für TLF (oder gleichw.), exkl. Mannschaft (nach Pos. 1.02)", einheit: "pauschal", festbetrag: 114.9 },
  { pos: "12.03", gruppe: 12, bezeichnung: "Brandsicherheitswachdienst bei Messe-, Zirkus-, Theater- und sonstigen Veranstaltungen, von 3 bis zu max. 12 Stunden, Pauschalgebühr für TLF (oder gleichw.), exkl. Mannschaft (nach Pos. 1.02)", einheit: "pauschal", festbetrag: 266.5 },
  { pos: "12.04", gruppe: 12, bezeichnung: "Nutzwassertransport nur Tanklöschfahrzeug bis 2.000l, mit Fahrer, Pauschale je Fahrt", einheit: "je_fahrt", festbetrag: 78.0, hinweis: "bzw. nach Aufwand" },
  { pos: "12.05", gruppe: 12, bezeichnung: "Nutzwassertransport nur Tanklöschfahrzeug >2.000l bis 4.000l, mit Fahrer, Pauschale je Fahrt", einheit: "je_fahrt", festbetrag: 105.6, hinweis: "bzw. nach Aufwand" },
  { pos: "12.06", gruppe: 12, bezeichnung: "Nutzwassertransport nur Tanklöschfahrzeug >4.000l bis 10.000l, mit Fahrer, Pauschale je Fahrt", einheit: "je_fahrt", festbetrag: 137.8, hinweis: "bzw. nach Aufwand" },
  { pos: "12.07", gruppe: 12, bezeichnung: "Nutzwassertransport nur Tanklöschfahrzeug >10.000l mit Fahrer, Pauschale je Fahrt", einheit: "je_fahrt", festbetrag: 153.9, hinweis: "bzw. nach Aufwand" },
  { pos: "12.08", gruppe: 12, bezeichnung: "Aufzugs- oder Liftöffnung, bis zu max. 30 Minuten, darüber hinaus nach Aufwand", einheit: "pauschal", festbetrag: 229.8, hinweis: "bis max. 30 Minuten, darüber hinaus nach Aufwand" },
  { pos: "13.01", gruppe: 13, bezeichnung: "Anschluss Brandmeldeanlage: Vollanschluss (mittels Übertragungssystem ÖNORM EN 54-21, Typ 1)", einheit: "je_monat", festbetrag: 75.6 },
  { pos: "13.02", gruppe: 13, bezeichnung: "Anschluss Brandmeldeanlage: Bei Weiterleitung des Alarms mittels digitalem oder analogem Telefon-Wählgerät, je Telefon-Wählgerät (mittels Übertragungssystem ÖNORM EN 54-21, Typ 2)", einheit: "je_monat", festbetrag: 37.8 },
  { pos: "13.03", gruppe: 13, bezeichnung: "Dauerhafte Aktivierung- oder Deaktivierung eines Anschlusses einer Brandmeldeanlage, je Fall", einheit: "je_fall", festbetrag: 63.2 },
  { pos: "13.04", gruppe: 13, bezeichnung: "Brandmelder-Fehl- und Täuschungsalarm", einheit: "nach_aufwand", mindestbetrag: 448.1, hinweis: "Berechnung nach Aufwand, mindestens 448,10" },
  { pos: "14.01", gruppe: 14, bezeichnung: "Kraftstoffe, Öle, Reinigungsmittel", einheit: "nach_aufwand", hinweis: "Berechnung zu den Tagespreisen, bezogen auf den Einsatztag" },
  { pos: "14.02", gruppe: 14, bezeichnung: "Pölzmaterial", einheit: "nach_aufwand", hinweis: "Berechnung zu den Tagespreisen, bezogen auf den Einsatztag" },
  { pos: "14.03", gruppe: 14, bezeichnung: "Atemschutzmaterial", einheit: "nach_aufwand", hinweis: "Berechnung zu den Tagespreisen, bezogen auf den Einsatztag" },
  { pos: "14.04", gruppe: 14, bezeichnung: "Sonstiges Verbrauchsmaterial", einheit: "nach_aufwand", hinweis: "Berechnung zu den Tagespreisen, bezogen auf den Einsatztag" },
  { pos: "15.01", gruppe: 15, bezeichnung: "Personal", einheit: "nach_aufwand", hinweis: "Berechnung zu den Tagespreisen sowie nach konkretem Aufwand (Notwendigkeit und Zweckmäßigkeit)" },
  { pos: "15.02", gruppe: 15, bezeichnung: "Fahrzeuge / Anhänger", einheit: "nach_aufwand", hinweis: "Berechnung zu den Tagespreisen sowie nach konkretem Aufwand (Notwendigkeit und Zweckmäßigkeit)" },
  { pos: "15.03", gruppe: 15, bezeichnung: "Werkzeuge / Ausrüstungsgegenstände", einheit: "nach_aufwand", hinweis: "Berechnung zu den Tagespreisen sowie nach konkretem Aufwand (Notwendigkeit und Zweckmäßigkeit)" },
];

const NACH_POS = new Map(TARIFORDNUNG_2026.map((p) => [p.pos, p] as const));

/** Tarifposition nach Nummer ("2.04"); undefined bei unbekannter Position. */
export function findeTarifPosition(pos: string): TarifPosition | undefined {
  return NACH_POS.get(pos);
}
