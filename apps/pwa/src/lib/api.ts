/**
 * Schlanker API-Client für die PWA. Holt das Tablet-JWT aus
 * localStorage (`hotdoc.tabletToken`) und hängt es als Bearer-Header
 * an alle Calls — der Token kommt aus dem Setup-PIN-Register-Flow.
 *
 * Liefert immer das geparste JSON oder wirft ApiError.
 *
 * URL-Aufloesung:
 *  - PWA (Browser): relative Pfade, Caddy proxied /api/* an hotdoc-api.
 *  - APK (Capacitor-Webview): Origin ist `https://localhost/`, dort gibt
 *    es keinen Proxy. Wir muessen die API-URL explizit absolut machen.
 *    Detection ueber `window.Capacitor.isNativePlatform()` — kein Import,
 *    weil dieser Layer keinen Capacitor-Plugin braucht.
 */

export const TOKEN_KEY = "hotdoc.tabletToken";

/** Production-API-Basis fuer Capacitor-Native — ueber https. */
const NATIVE_API_BASE = "https://hotdoc-api.fly.dev";

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function resolveApiUrl(path: string): string {
  // Schon absolute URL → unveraendert lassen
  if (/^https?:\/\//i.test(path)) return path;
  // Capacitor-Webview erkennt sich ueber window.Capacitor
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    // Sicherstellen dass kein doppelter Slash entsteht
    return `${NATIVE_API_BASE}${path.startsWith("/") ? path : "/" + path}`;
  }
  return path;
}

export function getTabletToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * ING-12 (Audit 2026-06-12): Klartext + Handlungsanweisung statt nackter
 * Fehlercodes. "HTTP 423" sagt der Mannschaft um 03:00 nichts — diese
 * Funktion übersetzt jeden API-Fehler in einen Satz, der erklärt was
 * passiert ist UND was als Nächstes zu tun ist (bzw. dass nichts zu tun
 * ist, weil die Outbox automatisch nachreicht).
 */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.message === "timeout") {
      return "Keine Verbindung — Eingaben sind lokal gesichert und werden automatisch übertragen.";
    }
    if (err.status === 423) {
      return "Bericht ist abgeschlossen — erst reaktivieren (Florian oder Archiv), dann wird automatisch nachgereicht.";
    }
    if (err.status === 409) {
      return "Wurde zwischenzeitlich anderweitig geändert — Anzeige wird aktualisiert.";
    }
    if (err.status === 401 || err.status === 403) {
      return "Anmeldung abgelaufen — bitte neu anmelden.";
    }
    if (err.status >= 500) {
      return "Server-Problem — wird automatisch erneut versucht.";
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

interface ReqOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * URL-Pfade die NICHT zum Token-Cleanup führen wenn 401 zurückkommt:
 * - /api/auth/* (Login / Handoff-Claim sind erwartbar manchmal 401, das
 *   ist nicht ein „Session abgelaufen"-Signal)
 * - /api/admin/health (Login-Status-Indikator pollt das public —
 *   kein Token nötig, SchnittstellenPanel im Backoffice macht das gleich)
 */
function isAuthBypassPath(path: string): boolean {
  return path.startsWith("/api/auth/") || path === "/api/admin/health";
}

/**
 * ING-11 (Audit 2026-06-12): Zweitprüfung vor dem Auto-Logout. Ein einzelner
 * 401 kann auch von einem Proxy-Schluckauf oder einem Backend-Deploy kommen —
 * vorher hat JEDER spuriöse 401 das Tablet mitten im Einsatz hart in den
 * Setup-Screen geworfen. Wir prüfen mit einem nackten fetch (NICHT apiCall —
 * keine Rekursion) gegen /api/auth/me nach:
 *  - "invalid":  /me liefert ebenfalls 401 → Token ist wirklich tot.
 *  - "valid":    /me liefert 2xx → der 401 war spuriös, KEIN Logout.
 *  - "unknown":  Netz-Fehler/anderer Status/Recheck läuft bereits → im
 *                Zweifel KEIN Logout (der nächste echte 401 prüft erneut).
 */
let authRecheckInFlight = false;

async function recheckAuth(token: string): Promise<"valid" | "invalid" | "unknown"> {
  if (authRecheckInFlight) return "unknown";
  authRecheckInFlight = true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(resolveApiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: ctrl.signal,
      });
      if (res.status === 401) return "invalid";
      if (res.ok) return "valid";
      return "unknown";
    } finally {
      clearTimeout(t);
    }
  } catch {
    return "unknown";
  } finally {
    authRecheckInFlight = false;
  }
}

export async function apiCall<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const token = getTabletToken();
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  // BLOCKER-2a (Audit 2026-06-03): Default-Timeout von 12 s. Ohne das hängt
  // jeder fetch im Funkloch bis zum OS-TCP-Timeout (30-120 s) — der Spinner
  // dreht ewig und hängende Sockets stapeln sich (verstärkt OOM-Kill auf dem
  // Tablet). Wir nutzen einen klassischen AbortController + setTimeout statt
  // AbortSignal.timeout(), weil ältere Android-System-WebViews letzteres nicht
  // kennen. Ein optional vom Caller übergebenes Signal wird mit-verdrahtet.
  const ctrl = new AbortController();
  const TIMEOUT_MS = 12_000;
  const timeoutHandle = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  init.signal = ctrl.signal;

  let res: Response;
  let text: string;
  try {
    res = await fetch(resolveApiUrl(path), init);
    text = res.status === 204 ? "" : await res.text();
  } catch (err) {
    // Timeout oder Caller-Abbruch → klarer ApiError statt nackter DOMException.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("timeout", 0, null);
    }
    // Netz-Fehler (offline, DNS, Connection refused) → als ApiError(status 0)
    // normalisieren, damit Outbox/Sync-Layer einheitlich darauf reagieren
    // (status 0 ist NICHT droppable → wird retry'ed, nicht verworfen).
    throw new ApiError(err instanceof Error ? err.message : "network_error", 0, null);
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (res.status === 204) return undefined as T;
  const body: unknown = text ? safeJson(text) : null;

  // Auto-Logout bei 401 wenn wir einen Token gesendet haben — der Token
  // wurde abgelehnt (z. B. Handoff-Auto-Release nach 24h, oder JWT
  // tatsächlich abgelaufen). Bypass für Auth-Routen selbst (sonst
  // Login-Schleife). ING-11 (Audit 2026-06-12): NICHT mehr sofort Token
  // löschen + reloaden — erst per /api/auth/me nachprüfen, ob der Token
  // wirklich tot ist. Nur dann ausloggen; ein spuriöser 401 (Proxy/Deploy)
  // wirft nur den ApiError und der Aufrufer/Retry macht normal weiter.
  if (res.status === 401 && token && !isAuthBypassPath(path)) {
    const verdict = await recheckAuth(token);
    if (verdict === "invalid") {
      try {
        // Setup.tsx zeigt den Grund an ("Anmeldung abgelaufen").
        sessionStorage.setItem("hotdoc.setupReason", "auth-failed");
      } catch {
        // egal
      }
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("hotdoc.handoffInfo");
      } catch {
        // egal
      }
      // Reload statt window.location.href damit der Service-Worker frische
      // App-Shell ausliefert wenn ein Update da ist.
      window.location.reload();
    }
    // Werfen in JEDEM Fall — bei "invalid" läuft der Reload (Promise darf
    // nicht als Erfolg resolven), bei "valid"/"unknown" soll der Aufrufer
    // den 401 normal behandeln (Outbox retry't, UI zeigt Meldung).
    throw new ApiError("session_expired", 401, body);
  }

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ??
      `HTTP ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
