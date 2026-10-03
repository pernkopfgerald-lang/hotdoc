/**
 * "In Verwendung"-Uebersicht fuer den Mailtext beim Berichtsabschluss — damit
 * der Geraetewart auf einen Blick sieht, was nach dem Einsatz zu reinigen,
 * zu pruefen oder nachzufuellen ist: pro Fahrzeug alle erfassten Geraete,
 * Atemschutz, Oelbindemittel und Anhaenger, dazu der Stapler (Florianstation).
 *
 * Reine Funktion auf Basis der BerichtDaten (Geraete sind dort schon als
 * Klartext aufgeloest).
 */

import type { BerichtDaten } from "./pdf/template.js";

export function baueNachbereitungText(d: BerichtDaten): string {
  const zeilen: string[] = [];
  let irgendwas = false;

  for (const fz of d.fahrzeugberichte ?? []) {
    const teile: string[] = [];
    if (fz.geraete.length > 0) teile.push(`  Geräte: ${fz.geraete.join(", ")}`);

    const asTraeger = fz.mannschaft.filter((m) => m.atemschutzAktiv);
    if (asTraeger.length > 0) {
      const details = asTraeger
        .map((m) =>
          typeof m.atemschutzDauerMin === "number" && m.atemschutzDauerMin > 0
            ? `${m.name} (${m.atemschutzDauerMin} min)`
            : m.name,
        )
        .join(", ");
      teile.push(`  Atemschutz: ${asTraeger.length} Träger — ${details}`);
    }
    if (fz.oelSaecke > 0) {
      teile.push(`  Ölbindemittel: ${fz.oelSaecke} ${fz.oelSaecke === 1 ? "Sack" : "Säcke"}`);
    }
    if (fz.anhaenger && fz.anhaenger.length > 0) {
      teile.push(`  Anhänger: ${fz.anhaenger.join(", ")}`);
    }
    if (teile.length === 0) continue;
    irgendwas = true;
    zeilen.push(`${fz.abk} (${fz.funkrufname}):`, ...teile, "");
  }

  if (d.staplerEingesetzt) {
    irgendwas = true;
    zeilen.push("Stapler (Florianstation): im Einsatz", "");
  }

  if (!irgendwas) return "";
  return ["IN VERWENDUNG (zur Nachbereitung):", "", ...zeilen].join("\n").trimEnd();
}
