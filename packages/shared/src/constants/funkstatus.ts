/**
 * Funkstatus (Statusfunk) der Einsatzfahrzeuge aus der ELS-Schnittstelle des
 * Landesfeuerwehrverbands.
 *
 * Quellen (Stand 30.10.2026, Test an der Wache):
 *  - `unit_status` traegt bei Fahrzeugen den Status als Buchstabencode:
 *    AD = Status 0 "Ausser Dienst", FF = Status 1 "Frei ueber Funk", FW = Status 2
 *    "Frei auf Wache", AU = Status 3 "Ausgerueckt/Einsatz uebernommen", AE = Status 4
 *    "Am Einsatzort" (bestaetigt mit Kommando und Tank, 30.10.2026; 3 und 4 ueber den
 *    Zeitablauf der Tasten, Wortlaut der Codes nicht belegt). Weitere Codes sind noch NICHT bekannt und werden
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
  AU: "3",
  AE: "4",
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

/**
 * Ist das Fahrzeug laut Funkstatus fest im Einsatz? 3 = Ausgerückt (Einsatz übernommen),
 * 4 = Am Einsatzort. Ab dann gilt das Fahrzeug auch ohne eingetragene Mannschaft/Fahrer
 * (also ohne Fahrzeugbericht) als "im Einsatz" und nicht als "wartend".
 */
export function funkstatusImEinsatz(code: string | undefined | null): boolean {
  const c = String(code ?? "").trim();
  return c === "3" || c === "4";
}

/**
 * Gehört die Funkmeldung eines Fahrzeugs zu DIESEM Einsatz?
 *  - Mit ELS-Einsatznummer: nur wenn der Einsatz diese Nummer (`els-<num1>`) trägt.
 *  - Ohne Einsatznummer: nur, wenn es genau einen aktiven Einsatz gibt (sonst unklar).
 */
export function funkGehoertZuEinsatz(p: {
  num1?: string | null | undefined;
  einsatzAlarmIds: ReadonlyArray<string | undefined>;
  einzigerAktiverEinsatz: boolean;
}): boolean {
  const num1 = (p.num1 ?? "").trim();
  if (num1) return p.einsatzAlarmIds.includes(`els-${num1}`);
  return p.einzigerAktiverEinsatz;
}

/**
 * Status der Florianstation selbst (ELS-Einheit "Feuerwehr/Florian Eberstalzell"),
 * Feld `status_florianstation`. Im Test (30.10.2026) lieferte es 0 = unbesetzt und
 * 1 = besetzt. Weitere Werte (Sprechwunsch, Alarmierungsauftrag) sind noch NICHT
 * bekannt und werden mit dem Rohwert angezeigt.
 */
export const FLORIANSTATION_TEXT: Readonly<Record<string, string>> = {
  "0": "Florianstation unbesetzt",
  "1": "Florianstation besetzt",
};

/** Ist die Florianstation besetzt? "1" = besetzt, "0" = unbesetzt, sonst (unbekannt/keine Daten) null. */
export function florianstationBesetzt(code: string | undefined | null): boolean | null {
  const c = String(code ?? "").trim();
  if (c === "1") return true;
  if (c === "0") return false;
  return null;
}

/** Chronik-Zeile fuer einen Statuswechsel der Florianstation. */
export function florianstationChronikText(code: string): string {
  const c = String(code).trim();
  return FLORIANSTATION_TEXT[c] ?? `Florianstation Status ${c}`;
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
