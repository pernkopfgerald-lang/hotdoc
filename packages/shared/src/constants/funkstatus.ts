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

/**
 * Kurztext fuer die Anzeige (Fahrzeug-Hauptseite, Florianstation, Backoffice) —
 * so, wie es die Mannschaft im Funk sagt. Die Chronik behaelt den laengeren
 * Text oben.
 */
export const FUNKSTATUS_KURZ: Readonly<Record<string, string>> = {
  "0": "Notruf",
  "1": "Frei über Funk",
  "2": "Frei auf Wache",
  "3": "Ausgerückt",
  "4": "Am Einsatzort",
  "5": "Sprechwunsch",
  "6": "Nicht einsatzbereit",
  "7": "Patient aufgenommen",
  "8": "Am Transportziel",
  "9": "Fremdanmeldung",
};

export type FunkstatusTon = "ok" | "info" | "warn" | "danger" | "neutral";

/** Kurztext fuer die Anzeige; leer wenn kein/unbekannter Status. */
export function funkstatusKurz(code: string | undefined | null): string {
  if (code === undefined || code === null) return "";
  return FUNKSTATUS_KURZ[String(code).trim()] ?? "";
}

/** Farbton der Anzeige: frei = gruen, im Einsatz = blau, Sprechwunsch/Notruf = rot/gelb. */
export function funkstatusTon(code: string | undefined | null): FunkstatusTon {
  switch (String(code ?? "").trim()) {
    case "1":
    case "2":
      return "ok";
    case "3":
    case "4":
    case "7":
    case "8":
      return "info";
    case "5":
      return "warn";
    case "0":
      return "danger";
    default:
      return "neutral";
  }
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
