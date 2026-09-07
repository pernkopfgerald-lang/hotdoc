/**
 * Review 2026-09-06: Geräte-Nutzung der letzten 40 Fahrzeugberichte pro
 * Fahrzeug tracken (localStorage) — damit GearChips die meistgenutzten
 * Geräte oben zeigen kann und der Rest hinter "weitere Geräte" verschwindet.
 * Manche Fahrzeuge (z. B. LFA-B) haben 20+ konfigurierte Geräte; die volle
 * Chip-Wand war unübersichtlich, obwohl im Alltag fast immer dieselben
 * 5-6 verwendet werden.
 *
 * Bewusst lokal (kein Server-Endpunkt): das Tablet ist ohnehin einem
 * Fahrzeug fix zugeordnet, die Statistik muss nicht geräteübergreifend
 * sein — und funktioniert damit auch offline.
 */

const KEY = "hotdoc.geraete.verlauf.v1";
const FENSTER = 40;

type Verlauf = Partial<Record<string, string[][]>>;

function readVerlauf(): Verlauf {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Verlauf) : {};
  } catch {
    return {};
  }
}

function writeVerlauf(v: Verlauf): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // Quota / Private-Mode — beim naechsten Abschluss wird einfach neu
    // begonnen, kein Absturz.
  }
}

/**
 * Nach dem Abschluss eines Fahrzeugberichts aufrufen — merkt sich, welche
 * Geräte-IDs verwendet wurden. Nur EIN Aufruf pro Bericht (beim Abschluss),
 * nicht bei jedem Live-Sync-Tick, sonst wuerde ein einziger langer Einsatz
 * das 40er-Fenster mit Zwischenstaenden desselben Berichts fluten.
 */
export function pushGeraeteVerlauf(fahrzeugId: string, gearIds: string[]): void {
  if (gearIds.length === 0) return;
  const v = readVerlauf();
  const liste = v[fahrzeugId] ?? [];
  liste.push(gearIds);
  v[fahrzeugId] = liste.slice(-FENSTER);
  writeVerlauf(v);
}

/**
 * Liefert die `n` meistgenutzten Geräte-IDs der letzten 40 Berichte dieses
 * Fahrzeugs, häufigste zuerst. Ohne Verlauf (frisches Tablet, noch keine
 * 40 Berichte) einfach leer — Aufrufer faellt dann auf die Katalog-
 * Reihenfolge zurueck.
 */
export function topGeraeteIds(fahrzeugId: string, n: number): string[] {
  const liste = readVerlauf()[fahrzeugId] ?? [];
  const counts = new Map<string, number>();
  for (const bericht of liste) {
    for (const id of bericht) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([id]) => id);
}
