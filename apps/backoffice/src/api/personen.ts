/**
 * Personen-Stammdaten (syBOS-Sync) fuer Personen-Selects im Backoffice.
 * D-04 (Audit R3): Einsatzleiter-, Fahrer-, Kdt- und Mannschafts-Selects
 * in der Florianstation brauchen die Personenliste mit Name + Rang.
 *
 * Server-Vertrag: GET /api/admin/personen -> { items:[{syBosId, vorname,
 * nachname, rang, aktiv}], standVom } — der Server filtert aktiv===false
 * bereits heraus.
 */
import { apiCall } from "./client";

export interface PersonItem {
  syBosId: number;
  vorname?: string;
  nachname?: string;
  rang?: string;
  aktiv?: boolean;
}

export interface PersonenResponse {
  items: PersonItem[];
  /** Zeitpunkt des letzten erfolgreichen syBOS-Syncs, null wenn nie. */
  standVom: string | null;
}

export async function listPersonen(): Promise<PersonenResponse> {
  const r = await apiCall<{ ok?: boolean; items?: PersonItem[]; standVom?: string | null }>(
    "/api/admin/personen",
  );
  return {
    items: Array.isArray(r.items)
      ? r.items.filter((p) => typeof p.syBosId === "number")
      : [],
    standVom: typeof r.standVom === "string" ? r.standVom : null,
  };
}

/** Anzeige-Label "Nachname Vorname (Rang)" — Rang nur wenn vorhanden. */
export function personLabel(p: PersonItem): string {
  const name = [p.nachname, p.vorname].filter((s) => typeof s === "string" && s.trim()).join(" ");
  const base = name || `#${p.syBosId}`;
  return p.rang ? `${base} (${p.rang})` : base;
}

/**
 * Sortierte Liste fuer Selects: alphabetisch nach Nachname, dann Vorname.
 * Kopie — mutiert die Eingabe nicht.
 */
export function sortPersonen(items: PersonItem[]): PersonItem[] {
  return [...items].sort((a, b) => {
    const an = `${a.nachname ?? ""} ${a.vorname ?? ""}`.trim().toLocaleLowerCase("de-AT");
    const bn = `${b.nachname ?? ""} ${b.vorname ?? ""}`.trim().toLocaleLowerCase("de-AT");
    return an.localeCompare(bn, "de-AT");
  });
}

/** Name zu einer syBosId aus einer geladenen Liste; Fallback "#id". */
export function personName(items: PersonItem[], id: number | undefined): string {
  if (typeof id !== "number") return "—";
  const p = items.find((x) => x.syBosId === id);
  return p ? personLabel(p) : `#${id}`;
}
