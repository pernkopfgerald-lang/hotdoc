/**
 * Funkstatus (Statusfunk) der Einsatzfahrzeuge aus der ELS-Schnittstelle des
 * Landesfeuerwehrverbands.
 *
 * Quellen (Stand 30.10.2026, Test an der Wache):
 *  - `unit_status` traegt bei Fahrzeugen den Status als Buchstabencode:
 *    AD = Status 0 "Ausser Dienst", FF = Status 1 "Frei ueber Funk", FW = Status 2
 *    "Frei auf Wache" (bestaetigt mit Kommando und Tank). Weitere Codes sind noch NICHT bekannt und werden
 *    unveraendert durchgereicht (der ELS-Verlauf in der DB zeichnet sie auf).
 *  - `status_florianstation` war bei Fahrzeugen im Test immer leer; bei der
 *    Florianstation selbst liefert es 0/1 (unbesetzt/besetzt).
 *
 * Bedeutung der Ziffern laut Leitstelle/Mannschaft: 0 = Ausser Dienst,
 * 5 = Sprechwunsch, 6 = Alarmierungsauftrag. 3/4/7/8/9 sind der uebliche
 * FMS-Standard und noch nicht an der Leitstelle bestaetigt. Texte stehen so in
 * der Einsatzchronik und im Bericht.
 */
export const FUNKSTATUS_TEXT: Readonly<Record<string, string>> = {
  "0": "Außer Dienst",
  "1": "Einsatzbereit über Funk",
  "2": "Eingerückt (einsatzbereit auf Wache)",
  "3": "Ausgerückt (Einsatz übernommen)",
  "4": "Am Einsatzort eingetroffen",
  "5": "Sprechwunsch",
  "6": "Alarmierungsauftrag",
  "7": "Patient aufgenommen",
  "8": "Am Transportziel",
  "9": "Fremdanmeldung",
};

/** Buchstabencodes aus `unit_status` (ELS), soweit bestaetigt. Rest: siehe funkstatusAusUnitStatus. */
export const ELS_UNITSTATUS_ZU_FUNKSTATUS: Readonly<Record<string, string>> = {
  AD: "0",
  FF: "1",
  FW: "2",
};

/**
 * Funkstatus-Code aus dem Buchstabencode `unit_status`. Bekannte Codes werden auf
 * die Ziffer abgebildet; unbekannte unveraendert (grossgeschrieben) durchgereicht,
 * damit sie sichtbar sind und aufgezeichnet werden, statt als "Frei" zu erscheinen.
 */
export function funkstatusAusUnitStatus(unitStatus: string | undefined | null): string {
  const roh = String(unitStatus ?? "").trim().toUpperCase();
  return ELS_UNITSTATUS_ZU_FUNKSTATUS[roh] ?? roh;
}

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
  "0": "Außer Dienst",
  "1": "Frei über Funk",
  "2": "Frei auf Wache",
  "3": "Ausgerückt",
  "4": "Am Einsatzort",
  "5": "Sprechwunsch",
  "6": "Alarmierungsauftrag",
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

/** Farbton der Anzeige: frei = gruen, im Einsatz/Alarmierungsauftrag = blau, Sprechwunsch/Ausser Dienst = gelb. */
export function funkstatusTon(code: string | undefined | null): FunkstatusTon {
  switch (String(code ?? "").trim()) {
    case "1":
    case "2":
      return "ok";
    case "3":
    case "4":
    case "6":
    case "7":
    case "8":
      return "info";
    case "0":
    case "5":
      return "warn";
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
