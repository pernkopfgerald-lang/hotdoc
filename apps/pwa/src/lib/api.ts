/**
 * Schlanker API-Client für die PWA. Holt das Tablet-JWT aus
 * localStorage (`hotdoc.tabletToken`) und hängt es als Bearer-Header
 * an alle Calls — der Token kommt aus dem Setup-PIN-Register-Flow.
 *
 * Liefert immer das geparste JSON oder wirft ApiError.
 */

export const TOKEN_KEY = "hotdoc.tabletToken";

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
 * - /api/admin/health (DemoBanner pollt das public — kein Token nötig)
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
  if (opts.signal) init.signal = opts.signal;

  const res = await fetch(path, init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
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
