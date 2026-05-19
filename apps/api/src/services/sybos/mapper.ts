/**
 * Mapping syBOS-Roh-Antworten → CouchDB-Dokumente.
 *
 * Wir halten die Mapping-Logik isoliert von HTTP-Client und DB,
 * damit die Mapper als pure Functions testbar bleiben.
 */

import type { Material, Person } from "@hotdoc/shared";
import type {
  SyBosAbteilungRaw,
  SyBosMaterialRaw,
  SyBosPersonRaw,
  SyBosPersUeberpruefungRaw,
} from "./client.js";

/**
 * Mappt eine syBOS-Personal-Antwort + Set von Atemschutz-gültigen Namen
 * auf unsere Person-Domain-Type.
 */
export function mapPerson(
  raw: SyBosPersonRaw,
  atemschutzGueltigeNamen: ReadonlySet<string>,
): Person {
  const vollname = `${raw.Nachname} ${raw.Vorname}`.trim();
  return {
    _id: `person:${raw.id}`,
    type: "person",
    syBosId: raw.id,
    nachname: raw.Nachname,
    vorname: raw.Vorname,
    dienstgrad: raw.Dienstgrad ?? "",
    email: raw.Email1?.includes("@") ? raw.Email1 : undefined,
    mobil1: raw.Mobil1 || undefined,
    mobil2: raw.Mobil2 || undefined,
    funktionen: parseFunktionen(raw.Funktionen),
    atemschutzGueltig: atemschutzGueltigeNamen.has(vollname),
    aktiv: true, // Endpoint liefert nur Aktive (Art=MITGLIEDER)
    letztesSync: new Date().toISOString(),
  };
}

function parseFunktionen(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Atemschutz-gültige Namen aus PersUeberpruefung-Antwort sammeln. */
export function buildAtemschutzSet(rows: SyBosPersUeberpruefungRaw[]): Set<string> {
  const result = new Set<string>();
  for (const r of rows) {
    if (!r.Name || !r.Pruefungsbezeichnung) continue;
    if (!/atemschutz/i.test(r.Pruefungsbezeichnung)) continue;
    if (r.Status === "o") result.add(r.Name);
  }
  return result;
}

/**
 * Mappt syBOS-Material auf unsere Material-Domain-Type.
 * Die fahrzeugId muss in einem späteren Schritt manuell zugeordnet werden
 * (in der Backoffice-Stammdaten-Pflege).
 */
export function mapMaterial(raw: SyBosMaterialRaw): Material {
  return {
    _id: `material:${raw.ID}`,
    type: "material",
    syBosId: raw.ID,
    bezeichnung: raw.Bezeichnung,
    klasse1: raw.Klasse1 || undefined,
    klasse2: raw.Klasse2 || undefined,
    klasse3: raw.Klasse3 || undefined,
    watCode: inferWatCode(raw),
    letztesSync: new Date().toISOString(),
  };
}

/**
 * syBOS liefert WAT-Code nicht direkt in der Material-Antwort; wir leiten
 * ihn aus Klasse1 / Bezeichnung ab (Heuristik). Sobald wir bessere
 * Mapping-Daten haben, hier präzisieren.
 */
function inferWatCode(raw: SyBosMaterialRaw): Material["watCode"] {
  const text = `${raw.Klasse1 ?? ""} ${raw.Bezeichnung}`.toLowerCase();
  if (/atemschutz|pa-?ger|maske/i.test(text)) return "atems";
  if (/bekleidung|stiefel|helm|jacke/i.test(text)) return "bekle";
  if (/boot|wasserfahrzeug/i.test(text)) return "boote";
  if (/container/i.test(text)) return "cont";
  if (/erste.?hilfe|verband|defi/i.test(text)) return "eh";
  if (/tlf|lfa|kdo|mtf|fahrzeug|anhänger/i.test(text)) return "fuhrp";
  if (/gebäude|tor|alarmanlage/i.test(text)) return "gt";
  if (/funk|telefon|kommunikation/i.test(text)) return "komun";
  if (/musik|instrument/i.test(text)) return "musik";
  if (/tauch/i.test(text)) return "tauch";
  if (/öl|bindemittel|generator|pumpe|leiter|säge|schaum/i.test(text)) return "gerae";
  return "sachm";
}

export interface AbteilungSummary {
  id: number;
  name: string;
  ort?: string;
}

export function mapAbteilung(raw: SyBosAbteilungRaw): AbteilungSummary {
  return {
    id: raw.ID,
    name: raw.Bezeichnung ?? raw.Name,
    ort: raw.Ort || undefined,
  };
}
