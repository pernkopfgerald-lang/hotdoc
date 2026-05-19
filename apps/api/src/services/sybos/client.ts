/**
 * syBOS Read-API Client — siehe HB_syBOS_API.pdf.
 *
 * Authentifizierung: token=<...> in der URL + serverseitige IP-Whitelist
 * (in syBOS Admin gepflegt). Ausgabeformat: JSON.
 *
 * Endpoints, die wir nutzen (alle "Read"):
 *   - /API/Personal.php?token=...&art=DEFAULT
 *   - /API/Material.php?token=...
 *   - /API/Abteilung.php?token=...
 *   - /API/PersUeberpruefung.php?token=...&Status=o     (für AS-Gültigkeit)
 */

import { env, hasSyBos } from "../../config.js";
import { logger } from "../../lib/logger.js";

export class SyBosError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly endpoint?: string,
  ) {
    super(message);
    this.name = "SyBosError";
  }
}

interface QueryOptions {
  /** zusätzliche URL-Parameter, werden serialisiert */
  params?: Record<string, string | number | boolean | undefined>;
  /** Default 30s — syBOS antwortet meistens unter 1s, aber große Listen können langsam sein */
  timeoutMs?: number;
}

async function call<T>(endpoint: string, options: QueryOptions = {}): Promise<T> {
  if (!hasSyBos()) {
    throw new SyBosError(
      "syBOS nicht konfiguriert (SYBOS_API_URL + SYBOS_TOKEN setzen)",
      undefined,
      endpoint,
    );
  }
  const base = env.SYBOS_API_URL!.replace(/\/$/, "");
  const url = new URL(`${base}/API/${endpoint}`);
  url.searchParams.set("token", env.SYBOS_TOKEN!);
  url.searchParams.set("json", "1");
  for (const [k, v] of Object.entries(options.params ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new SyBosError(`HTTP ${res.status} ${res.statusText}`, res.status, endpoint);
    }
    const text = await res.text();
    if (!text.trim()) {
      throw new SyBosError("Leere Antwort vom syBOS-Server", res.status, endpoint);
    }
    // syBOS liefert manchmal HTML-Fehlerseiten — JSON.parse fängt das
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      throw new SyBosError(
        `Antwort kein JSON: ${text.slice(0, 200)}…`,
        res.status,
        endpoint,
      );
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Konkrete Endpunkte ──────────────────────────────────────────

export interface SyBosPersonRaw {
  id: number;
  Nachname: string;
  Vorname: string;
  Titel1?: string;
  Titel2?: string;
  Dienstgrad?: string;
  Gruppe?: string;
  Dienststelle?: string;
  Email1?: string;
  Email2?: string;
  Mobil1?: string;
  Mobil2?: string;
  Foto?: string;
  GRnr?: number;
  Funktionen?: string;
}

export interface SyBosListResponse<T> {
  number: number;
  item: T[] | T;
}

/** Lädt alle aktiven Mitglieder (Art=MITGLIEDER). */
export async function getPersonalAktiv(): Promise<SyBosPersonRaw[]> {
  const res = await call<SyBosListResponse<SyBosPersonRaw>>("Personal.php", {
    params: { Art: "MITGLIEDER" },
  });
  const items = Array.isArray(res.item) ? res.item : res.item ? [res.item] : [];
  logger.debug({ count: items.length, total: res.number }, "syBOS Personal geladen");
  return items;
}

export interface SyBosMaterialRaw {
  ID: number;
  Klasse1?: string;
  Klasse2?: string;
  Klasse3?: string;
  Bezeichnung: string;
  Abteilung?: string;
  AnschaffungsDatum?: string;
  VeroeffentlichungsTitel?: string;
  VeroeffentlichungsText?: string;
}

/** Lädt Material — optional gefiltert auf WAT-Code (Atemschutz, Geräte, Fahrzeuge, …). */
export async function getMaterial(watCodes?: string[]): Promise<SyBosMaterialRaw[]> {
  const params: Record<string, string> = {};
  if (watCodes?.length) params.WATcode = watCodes.join(",");
  const res = await call<SyBosListResponse<SyBosMaterialRaw>>("Material.php", { params });
  const items = Array.isArray(res.item) ? res.item : res.item ? [res.item] : [];
  logger.debug({ count: items.length, total: res.number }, "syBOS Material geladen");
  return items;
}

export interface SyBosAbteilungRaw {
  ID: number;
  RefID?: number;
  Name: string;
  Bezeichnung?: string;
  Strasse?: string;
  LKZ?: string;
  PLZ?: string;
  Ort?: string;
  Telefon?: string;
  Fax?: string;
  Email?: string;
  Homepage?: string;
  Gruendung?: string;
  Code?: string;
  OrganisationsID?: number;
}

/** Lädt eigene Abteilung + ggf. übergeordnete (z. B. Bezirk). */
export async function getAbteilungen(): Promise<SyBosAbteilungRaw[]> {
  const res = await call<SyBosListResponse<SyBosAbteilungRaw>>("Abteilung.php");
  const items = Array.isArray(res.item) ? res.item : res.item ? [res.item] : [];
  logger.debug({ count: items.length, total: res.number }, "syBOS Abteilungen geladen");
  return items;
}

export interface SyBosPersUeberpruefungRaw {
  /** Personalname (Anzeige). */
  Name?: string;
  /** Prüfungsbezeichnung — z.B. "Atemschutz-Tauglichkeit". */
  Pruefungsbezeichnung?: string;
  /** Gültig-Bis Datum YYYY-MM-DD. */
  GueltigBis?: string;
  Status?: "o" | "e" | "w";
}

/**
 * Lädt Personal-Überprüfungen — wir nutzen das primär für die Atemschutz-Gültigkeit.
 * Filterbar nach Status (o=gültig, e=nicht-gültig, w=Warnung).
 */
export async function getPersUeberpruefungen(
  status?: "o" | "e" | "w",
): Promise<SyBosPersUeberpruefungRaw[]> {
  const params: Record<string, string> = {};
  if (status) params.Status = status;
  const res = await call<SyBosListResponse<SyBosPersUeberpruefungRaw>>(
    "PersUeberpruefung.php",
    { params },
  );
  const items = Array.isArray(res.item) ? res.item : res.item ? [res.item] : [];
  logger.debug({ count: items.length, total: res.number }, "syBOS PersUeberpruefungen geladen");
  return items;
}
