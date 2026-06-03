/**
 * Backoffice → Backend HTTP-Client.
 * Token-Auth via Bearer-Header, Token kommt aus localStorage nach Login.
 */

const TOKEN_KEY = "hotdoc.bo.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string): void {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiCall<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  const res = await fetch(path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(text || res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Issue 13 (Einsatz-Test 2026-06-02): Bearer-authentifizierter Download
 * fuer Binary-Endpoints (PDF). `window.open` schickt keine Auth-Header und
 * faellt deshalb am Backend mit 403 raus. Stattdessen: fetch mit Bearer
 * → Blob → object-URL → window.open. Object-URLs werden nach 60 s
 * revoked damit wir den Speicher nicht voller PDFs leaken.
 *
 * @returns die object-URL, falls der Aufrufer sie zusaetzlich braucht
 *   (z. B. fuer einen sichtbaren Link). Wirft ApiError bei HTTP-Fehler.
 */
export async function fetchAndOpenBlob(path: string, signal?: AbortSignal): Promise<string> {
  const token = getToken();
  const res = await fetch(path, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(text || res.statusText, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // Auto-revoke nach 60s damit der Browser den Speicher freigeben darf.
  // 60s reichen damit der neue Tab das PDF geladen hat — neue Chrome-
  // Versionen halten Blob-URLs lebensfaehig fuer den geoeffneten Tab.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}
