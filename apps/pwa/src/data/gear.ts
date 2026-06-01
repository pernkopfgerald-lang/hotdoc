/**
 * Geräte- und Mittel-Listen pro Fahrzeugtyp.
 *
 * Default-Konstanten — die Listen entsprechen dem Sollausstattungsstand
 * (Quelle: FF Eberstalzell Geräteinventar 2026). Werden vom Funktionaer
 * via Backoffice "Geraete"-Tab (config:geraete) ueberschrieben sobald die
 * PWA die Live-Config faehrt.
 */

import type { GearItem } from "../components/GearChips";
import type { FahrzeugId } from "@hotdoc/shared";

const COMMON: GearItem[] = [
  { id: "schlauchmaterial", bezeichnung: "Schlauchmaterial" },
  { id: "ölbindemittel", bezeichnung: "Ölbindemittel", isOelbindemittel: true },
];

const KDO: GearItem[] = [
  { id: "funkgeraet-handy", bezeichnung: "Handfunkgeräte" },
  { id: "atemschutz-set", bezeichnung: "Atemschutz-Reserve" },
  { id: "erste-hilfe", bezeichnung: "Erste-Hilfe-Set" },
  { id: "absperrband", bezeichnung: "Absperrband" },
  { id: "warnleuchten", bezeichnung: "Warnleuchten" },
];

const TLF: GearItem[] = [
  ...COMMON,
  { id: "loeschwasser-2000", bezeichnung: "Löschwasser 2000l" },
  { id: "loeschwasser-4000", bezeichnung: "Löschwasser 4000l (voll)" },
  { id: "schaumrohr", bezeichnung: "Schaumrohr" },
  { id: "schaummittel", bezeichnung: "Schaummittel" },
  { id: "tank-nachfuellung", bezeichnung: "Tank-Nachfüllung" },
  { id: "loeschangriff", bezeichnung: "Löschangriff intern" },
  { id: "monitor", bezeichnung: "Wasserwerfer/Monitor" },
];

const LFA_B: GearItem[] = [
  ...COMMON,
  { id: "ts-pumpe", bezeichnung: "TS Pumpe" },
  { id: "generator", bezeichnung: "Generator" },
  { id: "seilwinde", bezeichnung: "Seilwinde" },
  { id: "steckleiter", bezeichnung: "Steckleiter" },
  { id: "hochdruckluefter", bezeichnung: "Hochdrucklüfter" },
  { id: "schaumrohr", bezeichnung: "Schaumrohr" },
  { id: "hydraulischer-rettungssatz", bezeichnung: "Hydraulischer Rettungssatz" },
  { id: "waermebildkamera", bezeichnung: "Wärmebildkamera" },
  { id: "motorsaege", bezeichnung: "Motorsäge" },
  { id: "trennschleifer", bezeichnung: "Trennschleifer" },
];

const MTF: GearItem[] = [
  { id: "transportplaetze", bezeichnung: "Personentransport" },
  { id: "atemschutz-reserve", bezeichnung: "Atemschutz-Reserve" },
  { id: "verpflegung", bezeichnung: "Verpflegung" },
  { id: "decke-rettung", bezeichnung: "Rettungsdecken" },
  { id: "hr-anhaenger", bezeichnung: "HR-Anhänger gezogen" },
  { id: "hoehenretter-anhaenger", bezeichnung: "Höhenretter-Anhänger" },
  { id: "absperrmaterial", bezeichnung: "Absperrmaterial" },
];

export const GEAR_BY_FAHRZEUG: Record<FahrzeugId, GearItem[]> = {
  kdo: KDO,
  "tlf-a-4000": TLF,
  "lfa-b": LFA_B,
  mtf: MTF,
  zentrale: [], // Zentrale erfasst kein eigenes Gerät
};
