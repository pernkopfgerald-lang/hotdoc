/**
 * Whisper-Transkription via Backend-Route POST /api/audio/transcribe.
 *
 * Lädt ein Recording-Blob hoch und liefert das Transkript zurück.
 * Fehler werden differenziert, sodass die UI sinnvolle Meldungen zeigen
 * kann (Mikrofon-leer, Whisper-Backend-nicht-konfiguriert, Timeout, …).
 *
 * Die Funktion umgeht den apiCall-Helper, weil der ein JSON-Content-Type
 * erzwingt — Whisper braucht hier den Raw-Audio-Body mit dem Original-
 * MIME-Type des MediaRecorders.
 */

import { getTabletToken, resolveApiUrl } from "./api";

export type TranscribeOutcome =
  | { ok: true; text: string; durationSec: number }
  | { ok: false; reason: TranscribeFailReason; message?: string };

export type TranscribeFailReason =
  | "not_configured"        // OPENAI_API_KEY fehlt → Funktionär muss Secret setzen
  | "auth_required"         // 401 — Tablet-Token weg / abgelaufen
  | "audio_too_large"       // > 20 MB
  | "audio_empty"           // 0 Bytes
  | "unsupported_type"      // 415 — z. B. exotisches Codec
  | "whisper_timeout"       // 60s überschritten
  | "whisper_failed"        // 502 vom Backend
  | "network";              // fetch wirft, kein response

interface BackendOk {
  ok: true;
  text: string;
  durationSec: number;
  model: string;
}
interface BackendErr {
  error: string;
  message?: string;
  hint?: string;
}

/**
 * Sendet das aufgenommene Audio-Blob an /api/audio/transcribe und liefert
 * das Transkript-Ergebnis. Wirft NICHT — UI-Fehlerbehandlung über
 * `outcome.ok === false`.
 */
export async function transcribeAudio(
  blob: Blob,
  options: { lang?: string; signal?: AbortSignal } = {},
): Promise<TranscribeOutcome> {
  if (!blob || blob.size === 0) {
    return { ok: false, reason: "audio_empty" };
  }
  const token = getTabletToken();
  if (!token) {
    return { ok: false, reason: "auth_required" };
  }

  const lang = options.lang ?? "de";
  const url = `/api/audio/transcribe?lang=${encodeURIComponent(lang)}`;
  // Wir senden den Blob direkt als Raw-Body — Content-Type muss der
  // Original-MIME des MediaRecorder-Outputs sein (typ. audio/webm;codecs=opus).
  const mime = blob.type || "audio/webm";

  // ING-09 (Audit 2026-06-12): AbortController-Timeout 60 s (passend zum
  // Whisper-Backend-Limit) — ohne ihn hängt der Upload im Funkloch bis zum
  // OS-TCP-Timeout. Ein optional vom Caller übergebenes Signal wird
  // mit-verdrahtet (Muster aus apiCall).
  const ctrl = new AbortController();
  const timeoutHandle = setTimeout(() => ctrl.abort(), 60_000);
  if (options.signal) {
    if (options.signal.aborted) ctrl.abort();
    else options.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }

  try {
    // ING-09: resolveApiUrl — im Capacitor-Webview (Origin https://localhost)
    // gibt es keinen /api-Proxy, der relative Pfad würde garantiert failen.
    const res = await fetch(resolveApiUrl(url), {
      method: "POST",
      headers: {
        "Content-Type": mime,
        Authorization: `Bearer ${token}`,
      },
      body: blob,
      signal: ctrl.signal,
    });

    if (res.ok) {
      const json = (await res.json()) as BackendOk;
      return { ok: true, text: json.text ?? "", durationSec: json.durationSec ?? 0 };
    }

    // Fehler-Mapping
    let body: BackendErr | null = null;
    try {
      body = (await res.json()) as BackendErr;
    } catch {
      /* JSON-Parse failed — wir nutzen nur den Status-Code */
    }

    if (res.status === 503 && body?.error === "transcription_not_configured") {
      return {
        ok: false,
        reason: "not_configured",
        ...(body.hint ? { message: body.hint } : {}),
      };
    }
    if (res.status === 401) return { ok: false, reason: "auth_required" };
    if (res.status === 413) return { ok: false, reason: "audio_too_large" };
    if (res.status === 415) return { ok: false, reason: "unsupported_type" };
    if (res.status === 504 || body?.error === "whisper_timeout") {
      return { ok: false, reason: "whisper_timeout" };
    }
    return {
      ok: false,
      reason: "whisper_failed",
      message: body?.message ?? `HTTP ${res.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("aborted") ||
      msg.includes("AbortError") ||
      (err instanceof DOMException && err.name === "AbortError")
    ) {
      return { ok: false, reason: "whisper_timeout" };
    }
    return { ok: false, reason: "network", message: msg };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Mensch-lesbare Fehlermeldung pro Fail-Reason — für UI-Anzeige.
 */
export function describeFailure(reason: TranscribeFailReason): string {
  switch (reason) {
    case "not_configured":
      return "Transkription nicht aktiv. Funktionär muss OPENAI_API_KEY setzen.";
    case "auth_required":
      return "Sitzung abgelaufen — bitte neu anmelden.";
    case "audio_too_large":
      return "Aufnahme zu lang (max 20 MB). Bitte kürzer diktieren.";
    case "audio_empty":
      return "Kein Audio aufgenommen.";
    case "unsupported_type":
      return "Audio-Format vom Server nicht unterstützt.";
    case "whisper_timeout":
      return "Transkription dauerte zu lang. Erneut versuchen.";
    case "whisper_failed":
      return "Transkription fehlgeschlagen.";
    case "network":
      return "Kein Netz — Transkription kann später nachgeholt werden.";
  }
}
