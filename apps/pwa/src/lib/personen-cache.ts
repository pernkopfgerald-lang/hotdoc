/**
 * KDT-06 (Audit 2026-06-12): localStorage-Cache für die syBOS-Personalliste.
 *
 * Problem: Der personen-Load in BerichtPage/ZentralePage hatte einen leeren
 * catch — ein einziger Netz-Aussetzer beim Mount und der PersonPicker blieb
 * für den Rest des Einsatzes LEER (kein Fahrer/Kdt/Mannschaft eintragbar).
 * Im Funkloch-Boot war die Mannschaftserfassung damit komplett tot.
 *
 * Lösung analog geraete-config.ts: bei jedem erfolgreichen Fetch die Liste
 * cachen, im Fehlerfall den Cache als Fallback laden. Die Personalliste
 * ändert sich selten (syBOS-Sync) — ein leicht veralteter Stand ist im
 * Einsatz tausendmal besser als eine leere Liste.
 *
 * Wird von BerichtPage (Welle 1) und ZentralePage (Welle 2, AUDIT-09)
 * gemeinsam genutzt.
 */

import type { PickPerson } from "../components/PersonPickerModal";

const CACHE_KEY = "hotdoc.personen.v1";

/** Roh-Items defensiv auf die PickPerson-Form bringen — fremde/korrupte
 *  Storage-Daten dürfen den Boot nie brechen. */
function sanitizePersonen(raw: unknown): PickPerson[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PickPerson[] = [];
  for (const it of raw) {
    if (
      it &&
      typeof it === "object" &&
      typeof (it as { _id?: unknown })._id === "string" &&
      typeof (it as { syBosId?: unknown }).syBosId === "number" &&
      typeof (it as { nachname?: unknown }).nachname === "string" &&
      typeof (it as { vorname?: unknown }).vorname === "string"
    ) {
      const r = it as {
        _id: string;
        syBosId: number;
        nachname: string;
        vorname: string;
        dienstgrad?: unknown;
        atemschutzGueltig?: unknown;
      };
      out.push({
        _id: r._id,
        syBosId: r.syBosId,
        nachname: r.nachname,
        vorname: r.vorname,
        dienstgrad: typeof r.dienstgrad === "string" ? r.dienstgrad : "",
        atemschutzGueltig: r.atemschutzGueltig === true,
      });
    }
  }
  return out;
}

/** Liest die gecachte Personalliste (oder null wenn keine/korrupt). */
export function loadPersonenCache(): PickPerson[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const cleaned = sanitizePersonen(parsed);
    return cleaned && cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

/** Speichert die Personalliste nach erfolgreichem Fetch. */
export function savePersonenCache(list: PickPerson[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // Quota/Private-Mode → der nächste erfolgreiche Fetch versucht es erneut.
  }
}
