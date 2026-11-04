/**
 * Verrechnung nach Feuerwehr-Tarifordnung — Server-Glue.
 *
 * Die Rechenregeln liegen als reine Funktionen in @hotdoc/shared
 * (utils/verrechnung.ts). Hier wird nur das Einsatz-Bild (BerichtDaten) in den
 * Eingang der Berechnung uebersetzt und die Konfiguration (config:tarifordnung)
 * geladen. Das Ergebnis haengt als `verrechnung` an BerichtDaten und wird im
 * PDF als Verrechnungsblatt am Ende des Einsatzberichts gerendert.
 */

import {
  TARIF_STANDARD_EINSTELLUNGEN,
  baueVerrechnung,
  normalisiereTarifEinstellungen,
  type TarifEinstellungen,
  type VerrechnungEingaben,
  type VerrechnungErgebnis,
  type VerrechnungFahrzeug,
} from "@hotdoc/shared";
import { db } from "../couch/client.js";
import { logger } from "../lib/logger.js";
import type { BerichtDaten } from "./pdf/template.js";

/** config:tarifordnung laden; ohne Doc (oder bei Lesefehler) die Standard-Zuordnung. */
export async function ladeTarifEinstellungen(): Promise<TarifEinstellungen> {
  try {
    const doc = (await db.get("config:tarifordnung")) as { data?: unknown };
    return normalisiereTarifEinstellungen(doc.data);
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode !== 404) {
      logger.warn({ err }, "config:tarifordnung nicht lesbar — Standard-Zuordnung verwendet");
    }
    return TARIF_STANDARD_EINSTELLUNGEN;
  }
}

/** "HR-Anhänger" / "HR-Anhaenger" → config-Schluessel "HR-Anhaenger". */
function anhaengerKey(label: string): string {
  return label.replace(/ä/g, "ae").replace(/Ä/g, "Ae");
}

/** Fahrzeuge + eingesetzte Personen aus dem Berichtsbild. */
export function verrechnungFahrzeuge(d: BerichtDaten): VerrechnungFahrzeug[] {
  return (d.fahrzeugberichte ?? []).map((fz) => {
    const personen: Array<{ key: string; name: string }> = [];
    if (fz.fahrer) personen.push({ key: fz.fahrerId ? `p:${fz.fahrerId}` : `n:${fz.fahrer}`, name: fz.fahrer });
    if (fz.fahrzeugKdt) personen.push({ key: fz.kdtId ? `p:${fz.kdtId}` : `n:${fz.fahrzeugKdt}`, name: fz.fahrzeugKdt });
    for (const m of fz.mannschaft) {
      personen.push({ key: m.personId ? `p:${m.personId}` : `n:${m.name}`, name: m.name });
    }
    // Dieselbe Person nicht doppelt innerhalb EINES Fahrzeugs (Fahrer = Mannschaftsslot)
    const eindeutig = [...new Map(personen.map((p) => [p.key, p] as const)).values()];
    return {
      fahrzeugId: fz.fahrzeugId,
      bezeichnung: fz.funkrufname,
      ...(fz.zeitVon ? { zeitVon: fz.zeitVon } : {}),
      ...(fz.zeitBis ? { zeitBis: fz.zeitBis } : {}),
      personen: eindeutig,
      anhaenger: (fz.anhaenger ?? []).map(anhaengerKey),
    };
  });
}

/** Verrechnungsblatt fuer ein Berichtsbild berechnen. */
export function berechneVerrechnung(
  d: BerichtDaten,
  eingaben: VerrechnungEingaben | undefined,
  einstellungen: TarifEinstellungen,
): VerrechnungErgebnis {
  return baueVerrechnung({
    ...(d.einsatzTyp ? { einsatzTyp: d.einsatzTyp } : {}),
    ...(d.alarmierungZeit ? { alarmierungZeit: d.alarmierungZeit } : {}),
    ...(d.einsatzende ? { einsatzende: d.einsatzende } : {}),
    fahrzeuge: verrechnungFahrzeuge(d),
    ...(d.staplerEingesetzt ? { staplerEingesetzt: true } : {}),
    ...(d.oelbindemittelSaecke ? { oelbindemittelSaecke: d.oelbindemittelSaecke } : {}),
    ...(eingaben ? { eingaben } : {}),
    einstellungen,
  });
}
