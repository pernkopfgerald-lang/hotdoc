/**
 * Schlanker API-Client für die PWA. Holt das Tablet-JWT aus
 * localStorage (`hotdoc.tabletToken`) und hängt es als Bearer-Header
 * an alle Calls — der Token kommt aus dem Setup-PIN-Register-Flow.
 *
 * Liefert immer das geparste JSON oder wirft ApiError.
 */

const TOKEN_KEY = "hotdoc.tabletToken";

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
