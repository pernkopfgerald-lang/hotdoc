/**
 * Funkstatus (Statusfunk) der Einsatzfahrzeuge, wie ihn die ELS-Schnittstelle
 * des Landesfeuerwehrverbands liefert (`status_florianstation`).
 *
 * ACHTUNG: Die Beschreibung der Schnittstelle nennt nur Beispielwerte, keine
 * Bedeutungstabelle. Die Texte sind der uebliche FMS-Standard (1-9, 0) in der
 * Sprache der Einsatzdokumentation. Stimmt ein Text fuer unsere Leitstelle
 * nicht, hier anpassen — er steht so in der Einsatzchronik und im Bericht.
 */
export const FUNKSTATUS_TEXT: Readonly<Record<string, string>> = {
  "0": "Notruf (priorisierter Sprechwunsch)",
  "1": "Einsatzbereit über Funk",
  "2": "Eingerückt (einsatzbereit auf Wache)",
  "3": "Ausgerückt (Einsatz übernommen)",
  "4": "Am Einsatzort eingetroffen",
  "5": "Sprechwunsch",
  "6": "Nicht einsatzbereit",
  "7": "Patient aufgenommen",
  "8": "Am Transportziel",
  "9": "Fremdanmeldung",
};

/** Lesbarer Text zu einem Funkstatus-Rohwert; leer wenn unbekannt. */
export function funkstatusText(code: string | undefined | null): string {
  if (code === undefined || code === null) return "";
  return FUNKSTATUS_TEXT[String(code).trim()] ?? "";
}

/** Chronik-Zeile fuer einen Statuswechsel: "Funkstatus 4: Am Einsatzort eingetroffen". */
export function funkstatusChronikText(code: string): string {
  const c = String(code).trim();
  const text = funkstatusText(c);
  return text ? `Funkstatus ${c}: ${text}` : `Funkstatus ${c}`;
}

/** Erkennt Chronik-Eintraege aus dem Statusfunk (Text beginnt mit "Funkstatus <n>"). */
export function funkstatusAusChronikText(text: string | undefined): string | null {
  const m = /^Funkstatus\s+(\S+?)(?::|$)/.exec(text ?? "");
  return m?.[1] ?? null;
}
