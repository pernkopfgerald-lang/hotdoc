/**
 * Kleine, gemeinsame Format-Helfer der PWA (vorher mehrfach lokal kopiert).
 * Nur Kopien mit IDENTISCHEM Verhalten liegen hier; Varianten mit anderem
 * Ergebnis (z. B. AlarmCard.formatTime mit Sekunden, FlorianMapPopout.shortCode
 * mit "TLF"/"FLO", die verschiedenen initials()) bleiben bewusst lokal.
 */

import type { FahrzeugId } from "@hotdoc/shared";

/** Zweistellig mit fuehrender Null: 7 → "07". */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "HH:MM" (lokale Zeit) aus einem ISO-String; bei Fehler der Eingabewert. */
export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

/** Kurzcode der Fahrzeuge fuer Chips/Karten ("TANK", "LFA-B", …). */
export function shortCode(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "KDO";
    case "tlf-a-4000": return "TANK";
    case "lfa-b":      return "LFA-B";
    case "mtf":        return "MTF";
    case "zentrale":   return "FLORIAN";
  }
}

/**
 * Wie alt ist die letzte Position in Minuten? null = nie gesehen.
 * Zentrale ist fix und gibt immer 0 zurueck.
 */
export function staleMinutes(
  f: { isZentrale?: boolean | undefined; lastSeenAt?: string | undefined },
  now: number,
): number | null {
  if (f.isZentrale) return 0;
  if (!f.lastSeenAt) return null;
  const t = new Date(f.lastSeenAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60_000));
}
