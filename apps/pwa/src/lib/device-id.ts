/**
 * ING-04 (4-Personas-Audit, 2026-06-12): stabile Geraete-ID fuer die
 * Fremdschreib-Erkennung am Fahrzeugbericht (Tablet vs. QR-Handoff-Handy).
 *
 * Bewusst NICHT die deviceUuid aus device-register.ts wiederverwendet:
 * die liegt hinter der asynchronen Secure-Storage-Abstraktion (secureGet/
 * secureSet — auf Android EncryptedSharedPreferences) und waere nur per
 * await erreichbar. Die PUT-Bodies in BerichtPage (syncBerichtLive +
 * uploadFahrzeugbericht) werden aber synchron gebaut. Diese ID hier ist
 * ein reines Sichtbarkeits-Werkzeug ("welches Geraet hat zuletzt
 * geschrieben?"), kein Secret — localStorage reicht und ist synchron.
 */

const KEY = "hotdoc.device-id";

/** Modul-Cache: haelt die ID auch dann stabil, wenn localStorage gesperrt
 *  ist (Private-Mode / Storage-Quota) — dann wenigstens pro App-Laufzeit. */
let cached: string | null = null;

/** Zufalls-ID erzeugen — crypto.randomUUID mit Fallback fuer alte WebViews
 *  ohne randomUUID (Capacitor-WebView < Chrome 92, http-Kontext). */
function erzeugeId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // weiter zum Fallback unten
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Liefert die einmal erzeugte, persistente Geraete-ID. Ueberlebt Reloads
 * via localStorage (Key "hotdoc.device-id"). Bewusst Session-uebergreifend
 * stabil, aber NICHT geraeteuebergreifend — genau das macht sie als
 * Fremdschreiber-Unterscheidung brauchbar.
 */
export function getDeviceId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch {
    // localStorage nicht lesbar — unten frisch erzeugen (Laufzeit-stabil)
  }
  const id = erzeugeId();
  cached = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Speichern unmoeglich — ID bleibt fuer diese Session im Modul-Cache
  }
  return id;
}
