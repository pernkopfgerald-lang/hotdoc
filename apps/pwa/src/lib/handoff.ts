/**
 * Handoff-Sitzungs-Helper.
 *
 * Wenn der aktuelle Tablet/Handy via QR-Notfall-Übergabe an die Sitzung
 * gekommen ist, liegt unter `hotdoc.handoffInfo` ein JSON-Doc mit:
 *   - viaHandoff: true
 *   - autoReleaseAt: ISO-Datum (jetzt + 24h zum Claim-Zeitpunkt)
 *   - claimedAt:    Wann die Sitzung übernommen wurde
 *   - fahrzeugId / einsatzId: Kontext zur Anzeige
 *
 * `verifySession()` im Backend lehnt Tokens nach `autoReleaseAt` ab —
 * der Client wird dann beim nächsten API-Call mit 401 ausgeloggt.
 */

const KEY = "hotdoc.handoffInfo";
const TOKEN_KEY = "hotdoc.tabletToken";

export interface HandoffInfo {
  viaHandoff: true;
  autoReleaseAt?: string;
  claimedAt: string;
  fahrzeugId?: string;
  einsatzId?: string;
}

export function getHandoffInfo(): HandoffInfo | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const obj = JSON.parse(s) as Partial<HandoffInfo>;
    if (obj.viaHandoff === true && typeof obj.claimedAt === "string") {
      return obj as HandoffInfo;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Prüft ob der gespeicherte Handoff-Token sein Auto-Release-Datum
 * überschritten hat. True → der Client sollte sich selbst ausloggen.
 */
export function isHandoffExpired(info: HandoffInfo | null = getHandoffInfo()): boolean {
  if (!info?.autoReleaseAt) return false;
  const t = new Date(info.autoReleaseAt).getTime();
  if (Number.isNaN(t)) return false;
  return t < Date.now();
}

/**
 * Berechnet die verbleibenden Stunden bis zum Auto-Release. Liefert
 * null wenn kein Handoff aktiv ist oder kein autoReleaseAt gesetzt.
 */
export function handoffHoursLeft(info: HandoffInfo | null = getHandoffInfo()): number | null {
  if (!info?.autoReleaseAt) return null;
  const ms = new Date(info.autoReleaseAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, ms / (60 * 60 * 1000));
}

/**
 * Manueller Logout am Handy: Token + Handoff-Info clearen.
 * Best-Effort POST an /api/auth/handoff/release damit der Server
 * den Vorgang im Audit-Log mitbekommt — bei Netzwerk-Fehler einfach
 * trotzdem clientseitig clearen.
 */
export async function releaseHandoff(): Promise<void> {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      // Best-effort — kein await-Crash bei Fehlern
      try {
        await fetch("/api/auth/handoff/release", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      } catch {
        // egal — der Server-Log ist nicht kritisch
      }
    }
  } finally {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(KEY);
    } catch {
      // egal
    }
  }
}

/** Entfernt die Handoff-Info ohne API-Call — z. B. nach Auto-Release-Detection. */
export function clearHandoffLocal(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(KEY);
  } catch {
    // egal
  }
}
