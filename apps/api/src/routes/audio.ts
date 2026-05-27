/**
 * Audio-Transkription via OpenAI Whisper.
 *
 * Spec §24.1 hatte den lokalen Whisper-WASM als Gap. Hier ist der
 * Backend-Fallback: PWA pusht das aufgenommene Audio-Blob als Raw-
 * Body zum Server, der ruft OpenAI Whisper API und gibt das Transkript
 * zurück.
 *
 * - POST /api/audio/transcribe
 *   Body:    Raw-Audio (audio/webm, audio/mp4, audio/ogg, audio/wav, audio/mpeg)
 *   Query:   ?lang=de  (Default deutsch)
 *   Response: { ok: true, text: "...", durationSec, model }
 *
 * Sicherheit:
 *  - requireAuth() — nur eingeloggte Tablets/Backoffice-User
 *  - Body-Limit 25 MB (Whisper's eigene Grenze)
 *  - Timeout 60s (Whisper braucht typ. 5-15s für ein 30s-Diktat)
 *  - PII: Audio wird NICHT in fly-Logs gespeichert (nur Größe + Status)
 */

import { Router, type RequestHandler } from "express";
import express from "express";
import { env } from "../config.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const audioRouter: Router = Router();

/** Whisper akzeptiert max 25 MB. Wir setzen 20 MB als Sicherheits-Puffer. */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

/** Welche MIME-Types der Browser typischerweise liefert. */
const ACCEPTED_MIMES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

/**
 * MIME → File-Extension. Whisper-API braucht ein Filename mit korrekter
 * Extension, sonst lehnt sie den Upload mit 400 ab.
 */
function extFor(mime: string): string {
  const m = mime.toLowerCase().split(";")[0]?.trim() ?? "";
  switch (m) {
    case "audio/webm": return "webm";
    case "audio/ogg":  return "ogg";
    case "audio/mp4":  return "m4a";
    case "audio/mpeg": return "mp3";
    case "audio/wav":
    case "audio/x-wav": return "wav";
    default:           return "webm";
  }
}

audioRouter.post(
  "/api/audio/transcribe",
  requireAuth(),
  // Raw-Body-Parser nur für diese Route — überschreibt den globalen
  // express.json()-Parser für audio/* Content-Types.
  express.raw({
    type: ["audio/*", "application/octet-stream"],
    limit: MAX_AUDIO_BYTES,
  }),
  (async (req, res) => {
    const contentType = (req.headers["content-type"] ?? "").toString();
    const baseMime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!ACCEPTED_MIMES.has(baseMime) && baseMime !== "application/octet-stream") {
      res.status(415).json({
        error: "unsupported_audio_type",
        accepted: [...ACCEPTED_MIMES],
        got: contentType,
      });
      return;
    }

    const buf = req.body as Buffer | undefined;
    if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ error: "empty_audio" });
      return;
    }
    if (buf.length > MAX_AUDIO_BYTES) {
      res.status(413).json({ error: "audio_too_large", maxBytes: MAX_AUDIO_BYTES });
      return;
    }

    if (!env.OPENAI_API_KEY) {
      res.status(503).json({
        error: "transcription_not_configured",
        hint: "OPENAI_API_KEY fehlt — Funktionär muss fly secrets setzen.",
      });
      return;
    }

    const lang = typeof req.query.lang === "string" ? req.query.lang : "de";
    const t0 = Date.now();
    const session = req.session!;
    logger.info(
      { bytes: buf.length, mime: baseMime, lang, by: session.username },
      "Whisper-Transkription gestartet",
    );

    // Multipart-Body bauen — globaler FormData ist in Node 20+ verfügbar.
    const fd = new FormData();
    const ext = extFor(baseMime);
    const blob = new Blob([new Uint8Array(buf)], { type: baseMime || "audio/webm" });
    fd.append("file", blob, `aufnahme.${ext}`);
    fd.append("model", "whisper-1");
    fd.append("language", lang);
    // response_format=verbose_json liefert auch durationSec, aber wir bleiben
    // bei text damit die Response klein bleibt und schneller über die Leitung
    // geht. Falls später Wortmarken nötig sind, hier auf "verbose_json" wechseln.
    fd.append("response_format", "json");
    fd.append("temperature", "0");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: fd,
        signal: controller.signal,
      });

      const durationSec = Math.round((Date.now() - t0) / 100) / 10;

      if (!r.ok) {
        const errText = await r.text().catch(() => "");
        logger.warn(
          { status: r.status, errText: errText.slice(0, 200), durationSec },
          "Whisper-API antwortete mit Fehler",
        );
        res.status(502).json({
          error: "whisper_failed",
          status: r.status,
          message: errText.slice(0, 200) || `HTTP ${r.status}`,
        });
        return;
      }

      const json = (await r.json()) as { text?: string };
      const text = (json.text ?? "").trim();
      logger.info(
        { bytes: buf.length, chars: text.length, durationSec },
        "Whisper-Transkription fertig",
      );
      res.json({
        ok: true,
        text,
        durationSec,
        model: "whisper-1",
      });
    } catch (err) {
      const durationSec = Math.round((Date.now() - t0) / 100) / 10;
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("aborted") || msg.includes("AbortError");
      logger.warn(
        { msg, durationSec, isTimeout, bytes: buf.length },
        "Whisper-Transkription fehlgeschlagen",
      );
      res.status(isTimeout ? 504 : 502).json({
        error: isTimeout ? "whisper_timeout" : "whisper_unreachable",
        message: msg.slice(0, 200),
      });
    } finally {
      clearTimeout(timer);
    }
  }) as RequestHandler,
);
