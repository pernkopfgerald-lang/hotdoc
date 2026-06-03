// Issue 16 (Einsatz-Test 2026-06-02): syBOS Technisch-Statistik Konstanten
// (Stand 2026-06, abgeleitet aus syBOS-Eingabemaske).
//
// Diese Liste dient als Default-Vorbelegung der Auswahl-Felder im Florian-
// Editor wenn `kategorieFuer(einsatzart) === "technisch"`. Der Sachbearbeiter
// uebernimmt die Werte 1:1 in die syBOS-Maske. syBOS-API wird hier NICHT
// angesprochen — wir sammeln nur lokal, der Export erfolgt manuell.

export const URSACHE_TECHNISCH = [
  "Unbekannt",
  "Menschliches Versagen",
  "Technisches Gebrechen",
  "Verkehrsunfall",
  "Naturereignis (Sturm, Hochwasser)",
  "Tier",
  "Vorsatz",
  "Brand",
  "Auslaufende Betriebsstoffe",
  "Sonstiges",
] as const;
export type UrsacheTechnisch = (typeof URSACHE_TECHNISCH)[number];

export const HAUPT_TAETIGKEIT_TECHNISCH = [
  "Verkehrsunfall (Fahrzeugbergung, Eingeklemmt)",
  "Verkehrsabsicherung",
  "Personenrettung allgemein",
  "Tierrettung allgemein",
  "Wassergefahr (Überschwemmung, Wasserschaden)",
  "Ölspur / Ölbindung",
  "Pumparbeiten",
  "Türöffnung",
  "Sturm/Schneeschaden",
  "Aufzugsbergung",
  "Beseitigung Hindernis Verkehrsraum",
  "Hilfsdienst Behörde / Drittfahrzeug",
  "Suchaktion",
  "Höhenrettung",
  "Gefährliche Stoffe austretend",
  // Issue #161 (v0.1.12): Funktionaer-Feedback — "Arbeitsauftrag" fehlte
  // bisher und ist in syBOS eine eigene Kategorie. Wird vom Sachbearbeiter
  // z. B. fuer planmaessige Wartungs-/Beistandseinsaetze gebraucht.
  "Arbeitsauftrag",
  "Sonstige Hilfeleistung",
] as const;
export type HauptTaetigkeitTechnisch = (typeof HAUPT_TAETIGKEIT_TECHNISCH)[number];

export const WEITERE_TAETIGKEITEN_TECHNISCH = [
  "Brandsicherheit gestellt",
  "Notfall-/Erstversorgung",
  "Absperrmaßnahme",
  "Beleuchtung",
  "Stromversorgung",
  "Tauchen",
  "Trinkwasserversorgung",
  "Verkehrsregelung",
  "Sonstiges",
] as const;
export type WeitereTaetigkeitTechnisch = (typeof WEITERE_TAETIGKEITEN_TECHNISCH)[number];

// Wird vom Funktionaer im Backoffice gepflegt (config:gefaehrliche-stoffe).
// Default-Liste leer — wird ueber CRUD-Editor erweitert.
export const GEFAEHRLICHE_STOFFE_DEFAULT: ReadonlyArray<string> = [];
