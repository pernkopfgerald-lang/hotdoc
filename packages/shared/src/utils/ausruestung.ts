/**
 * Ausruestungs-Check: prueft beim Abschluss eines Fahrzeugberichts, ob zum
 * Einsatzstichwort die ueblichen Geraete erfasst wurden.
 *
 * Reine Funktionen ohne Abhaengigkeiten — dieselbe Logik laeuft im Tablet
 * (offline-faehig), im Backoffice-Testmodus und auf dem Server.
 *
 * Regel-Semantik:
 *  - `stichwort` ist ein Wildcard-Muster (`*` = beliebig viele Zeichen,
 *    `?` = genau ein Zeichen), Gross-/Kleinschreibung egal. Das Muster
 *    muss das GANZE Stichwort treffen (`TH VU*` trifft "TH VU" und
 *    "TH VU Person eingeklemmt", `TH VU` nur genau "TH VU").
 *  - Die Regel gilt nur fuer das genannte Fahrzeug UND nur, wenn dieses
 *    Fahrzeug am Einsatz beteiligt ist (also im Eingabe-Objekt vorkommt).
 *  - Erfuellt ist eine Regel, wenn mindestens EIN Geraet der Liste erfasst ist.
 *  - MUSS verhindert den Abschluss, INFO zeigt nur einen Vorschlag.
 *  - Keine passende Regel = kein Check (nie blockieren).
 */

export type AusruestungsPruefart = "MUSS" | "INFO";

export interface AusruestungsRegel {
  id: string;
  /** Wildcard-Muster fuer das Einsatzstichwort, z. B. "TH VU*". */
  stichwort: string;
  /** Fahrzeug-ID wie in FAHRZEUGE (kdo, tlf-a-4000, lfa-b, mtf). */
  fahrzeug: string;
  /** Geraete-IDs (wie in config:geraete) — mindestens eines muss erfasst sein. */
  geraete: string[];
  pruefart: AusruestungsPruefart;
  /** Ab diesem Datum (YYYY-MM-DD) gueltig; leer = sofort. */
  gueltigAb?: string;
  notiz?: string;
  /** false = Regel pausiert. Default aktiv. */
  aktiv?: boolean;
}

export interface AusruestungsWarnung {
  regelId: string;
  fahrzeug: string;
  severity: AusruestungsPruefart;
  /** Erwartete Geraete (IDs) der Regel. */
  erwartet: string[];
  /** Tatsaechlich erfasste Geraete (IDs) dieses Fahrzeugs. */
  erfasst: string[];
  message: string;
}

export interface AusruestungsErgebnis {
  /** false, wenn mindestens eine MUSS-Regel nicht erfuellt ist. */
  valid: boolean;
  stichwort: string;
  /** Alle passenden Regeln (auch erfuellte) — fuer die Anzeige im Testmodus. */
  matchingRules: AusruestungsRegel[];
  warnings: AusruestungsWarnung[];
}

/** Wildcard-Muster → RegExp (nur `*` und `?` sind Platzhalter). */
export function wildcardToRegExp(muster: string): RegExp {
  const escaped = muster
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

export function wildcardMatch(muster: string, text: string): boolean {
  if (!muster.trim()) return false;
  return wildcardToRegExp(muster).test(text.trim());
}

function normalisiere(s: string): string {
  return s.trim().toLowerCase();
}

/** Alle zum Stichwort passenden, aktiven und bereits gueltigen Regeln. */
export function findeRegeln(
  regeln: readonly AusruestungsRegel[],
  stichwort: string,
  jetzt: Date = new Date(),
): AusruestungsRegel[] {
  const heute = jetzt.toISOString().slice(0, 10);
  const text = stichwort.trim();
  if (!text) return [];
  return regeln.filter((r) => {
    if (r.aktiv === false) return false;
    if (r.gueltigAb && r.gueltigAb > heute) return false;
    if (!r.geraete || r.geraete.length === 0) return false;
    return wildcardMatch(r.stichwort, text);
  });
}

export interface AusruestungsEingabe {
  /** Einsatzstichwort bzw. Einsatzart des Berichts. */
  stichwort: string;
  /** Pro beteiligtem Fahrzeug die erfassten Geraete-IDs. */
  ausruestungProFahrzeug: Record<string, readonly string[]>;
  regeln: readonly AusruestungsRegel[];
  /** Klartext fuer Meldungen: Geraete-ID → Bezeichnung (optional). */
  geraeteNamen?: Readonly<Record<string, string>>;
  jetzt?: Date;
}

export function validiereAusruestung(eingabe: AusruestungsEingabe): AusruestungsErgebnis {
  const matching = findeRegeln(eingabe.regeln, eingabe.stichwort, eingabe.jetzt);
  const warnings: AusruestungsWarnung[] = [];
  const name = (id: string): string => eingabe.geraeteNamen?.[id] ?? id;

  for (const regel of matching) {
    const erfasstRoh = eingabe.ausruestungProFahrzeug[regel.fahrzeug];
    // Fahrzeug nicht beteiligt → Regel nicht anwendbar.
    if (!erfasstRoh) continue;
    const erfasstNorm = new Set(erfasstRoh.map(normalisiere));
    // Erfasst gilt auch, wenn statt der ID die Bezeichnung als Freitext
    // erfasst wurde (Freitext-Geraete landen 1:1 als materialId).
    const erwartetNorm = regel.geraete.map((g) => [g, normalisiere(g), normalisiere(name(g))] as const);
    const erfuellt = erwartetNorm.some(([, id, bez]) => erfasstNorm.has(id) || erfasstNorm.has(bez));
    if (erfuellt) continue;
    const erwartetText = regel.geraete.map(name).join(", ");
    const erfasstText = erfasstRoh.length > 0 ? erfasstRoh.map(name).join(", ") : "nichts erfasst";
    warnings.push({
      regelId: regel.id,
      fahrzeug: regel.fahrzeug,
      severity: regel.pruefart,
      erwartet: [...regel.geraete],
      erfasst: [...erfasstRoh],
      message:
        regel.pruefart === "MUSS"
          ? `Gerät erforderlich (eines davon): ${erwartetText}`
          : `Wird bei diesem Stichwort üblicherweise erfasst: ${erwartetText} (erfasst: ${erfasstText})`,
    });
  }

  return {
    valid: !warnings.some((w) => w.severity === "MUSS"),
    stichwort: eingabe.stichwort,
    matchingRules: matching,
    warnings,
  };
}
