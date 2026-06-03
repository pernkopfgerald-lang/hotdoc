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
  // tatsächlich abgelaufen). Token + Handoff-Info löschen, dann reload
  // damit App.tsx den Setup-Screen anzeigt. Bypass für Auth-Routen
  // selbst (sonst Login-Schleife).
  if (res.status === 401 && token && !isAuthBypassPath(path)) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem("hotdoc.handoffInfo");
    } catch {
      // egal
    }
    // Reload statt window.location.href damit der Service-Worker frische
    // App-Shell ausliefert wenn ein Update da ist.
    window.location.reload();
    // Promise will nie resolven weil der Reload läuft — werfen damit
    // der Call-Site nicht versucht das Result zu nutzen.
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
