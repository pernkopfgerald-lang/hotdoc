import { MicOff, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MicRecorder, type MicStatus, type RecordingResult } from "../lib/audio";
import {
  WebSpeechRecognizer,
  isWebSpeechAvailable,
  type SpeechResult,
  type SpeechStatus,
} from "../lib/web-speech";

/**
 * Vereinheitlichter Diktat-Output. Der Caller verarbeitet beide Varianten:
 *  - "speech": direkt verwendbarer Text aus Web-Speech (kein Server-Upload nötig)
 *  - "audio":  Audio-Blob aus MediaRecorder (Fallback wenn Web-Speech nicht
 *              verfügbar ist — z. B. iOS-Safari oder Firefox)
 */
export type DictateResult =
  | { kind: "speech"; text: string; durationMs: number; confidence: number }
  | { kind: "audio"; blob: Blob; mimeType: string; durationMs: number };

interface Props {
  onResult: (result: DictateResult) => void;
  /** Aufnahmen unter dieser Dauer werden verworfen (vs. versehentlicher Tap). */
  minDurationMs?: number;
}

/**
 * Press-and-Hold-Diktat-Button mit zweistufiger Strategie:
 *  - Primär: Web-Speech-API (Chrome/Edge) → liefert Text sofort, kostenlos.
 *  - Fallback: MediaRecorder → Audio-Blob, der serverseitig (Whisper) oder
 *    manuell transkribiert wird. Aktiv auf iOS-Safari + Firefox.
 *
 * Touch-tauglich: PointerDown/Up/Leave. Mikrofon wird beim ersten Druck
 * angefragt und für die Lebenszeit der Komponente gecacht.
 */
export function DictateButton({ onResult, minDurationMs = 400 }: Props) {
  // Engine-Wahl einmalig bei Mount. Bei isWebSpeechAvailable() wird der
  // Browser-Konstruktor geprüft — wir allokieren nichts.
  const engineRef = useRef<"speech" | "audio">(isWebSpeechAvailable() ? "speech" : "audio");
  const speechRef = useRef<WebSpeechRecognizer | null>(null);
  const audioRef = useRef<MicRecorder | null>(null);

  // Lazy-Init der Engines.
  if (engineRef.current === "speech" && !speechRef.current) {
    speechRef.current = new WebSpeechRecognizer();
  }
  if (engineRef.current === "audio" && !audioRef.current) {
    audioRef.current = new MicRecorder();
  }

  const [status, setStatus] = useState<MicStatus | SpeechStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      speechRef.current?.release();
      audioRef.current?.release();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function onDown() {
    if (engineRef.current === "speech") {
      const rec = speechRef.current!;
      if (rec.status === "idle" || rec.status === "error") {
        setStatus("requesting");
        const next = await rec.prepare();
        setStatus(next);
        if (next !== "ready") {
          // Web-Speech weg, dynamisch auf Audio-Fallback umschalten.
          if (next === "unavail") {
            engineRef.current = "audio";
            if (!audioRef.current) audioRef.current = new MicRecorder();
          } else {
            return;
          }
        }
      } else if (rec.status === "denied" || rec.status === "unavail") {
        setStatus(rec.status);
        return;
      }
      if (engineRef.current === "speech") {
        if (!rec.start("de-DE")) return;
        setStatus("recording");
        setSeconds(0);
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        return;
      }
    }

    // Audio-Fallback (auch dynamisch erreicht)
    const ar = audioRef.current!;
    if (ar.status === "idle" || ar.status === "error") {
      setStatus("requesting");
      const next = await ar.prepare();
      setStatus(next);
      if (next !== "ready") return;
    } else if (ar.status === "denied" || ar.status === "unavail") {
      setStatus(ar.status);
      return;
    }
    if (!ar.start()) return;
    setStatus("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  async function onUpOrLeave() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (engineRef.current === "speech") {
      const rec = speechRef.current!;
      if (rec.status !== "recording") return;
      const r = await rec.stop();
      setStatus(rec.status);
      if (r && r.durationMs >= minDurationMs) {
        onResult({
          kind: "speech",
          text: r.text,
          durationMs: r.durationMs,
          confidence: r.confidence,
        });
      }
      return;
    }

    const ar = audioRef.current!;
    if (ar.status !== "recording") return;
    const result = await ar.stop();
    setStatus(ar.status);
    if (result && result.durationMs >= minDurationMs) {
      onResult({
        kind: "audio",
        blob: result.blob,
        mimeType: result.mimeType,
        durationMs: result.durationMs,
      });
    }
  }

  const recording = status === "recording";
  const disabled = status === "denied" || status === "unavail";

  // UI-Text — engine-abhängig damit der User weiß was passiert.
  const engineLabel = engineRef.current === "speech" ? "live · gratis" : "Audio · Whisper";
  const t1 = recording
    ? "Diktiere · jetzt sprechen"
    : status === "requesting"
      ? "Mikrofon-Zugriff bestätigen …"
      : disabled
        ? "Mikrofon verweigert"
        : "Halten zum Diktieren";
  const t2 = recording
    ? `${formatSecs(seconds)} · loslassen zum stoppen`
    : disabled
      ? engineRef.current === "speech"
        ? "Im Browser freigeben"
        : "Im Browser freigeben"
      : `Push-to-Talk · ${engineLabel}`;

  // Wave-Höhen so wie im Design-Sample
  const waveHeights = [10, 18, 8, 22, 14, 24, 11, 16, 8, 12];

  return (
    <button
      type="button"
      onPointerDown={onDown}
      onPointerUp={onUpOrLeave}
      onPointerLeave={onUpOrLeave}
      disabled={disabled}
      className={`dictate${recording ? " recording" : ""}`}
      style={disabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
    >
      <div className="dictate-btn">
        {disabled ? <MicOff size={20} /> : <Mic size={20} />}
      </div>
      <div className="dictate-text">
        <div className="t1">{t1}</div>
        <div className="t2">{t2}</div>
      </div>
      <div className="dictate-wave">
        {waveHeights.map((h, i) => (
          <span key={i} style={{ height: `${h}px` }} />
        ))}
      </div>
    </button>
  );
}

function formatSecs(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Re-export für Backwards-Compat — BerichtPage importiert immer noch RecordingResult. */
export type { RecordingResult, SpeechResult };
