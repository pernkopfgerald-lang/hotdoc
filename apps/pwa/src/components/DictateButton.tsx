import { AlertCircle, Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MicRecorder, type MicStatus, type RecordingResult } from "../lib/audio";

interface Props {
  /** Bekommt das Audio-Blob + Dauer beim Loslassen. */
  onAudio: (result: RecordingResult) => void;
  /** Optional: Min-Dauer in ms. Kürzere Aufnahmen werden verworfen. */
  minDurationMs?: number;
}

/**
 * Press-and-Hold-Diktat-Button mit echter MediaRecorder-Aufnahme.
 *
 * Verhalten:
 * - Erster Press: fragt Mikrofon-Permission (falls noch nicht erteilt)
 * - Während des Haltens: läuft die Aufnahme, Live-Timer und Pulse-Animation
 * - Loslassen: stoppt, übergibt das Blob via onAudio
 * - Pointer verlässt Button (z. B. Finger rutscht ab): wie Loslassen
 */
export function DictateButton({ onAudio, minDurationMs = 400 }: Props) {
  const recorderRef = useRef<MicRecorder | null>(null);
  if (!recorderRef.current) recorderRef.current = new MicRecorder();

  const [status, setStatus] = useState<MicStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      recorderRef.current?.release();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function onDown() {
    const rec = recorderRef.current!;
    // Erste Permission-Anfrage: prepare läuft, status → "requesting"
    if (rec.status === "idle" || rec.status === "error") {
      setStatus("requesting");
      const next = await rec.prepare();
      setStatus(next);
      if (next !== "ready") return;
    } else if (rec.status === "denied" || rec.status === "unavail") {
      setStatus(rec.status);
      return;
    }
    const ok = rec.start();
    if (!ok) return;
    setStatus("recording");
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  async function onUpOrLeave() {
    const rec = recorderRef.current!;
    if (rec.status !== "recording") return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const result = await rec.stop();
    setStatus(rec.status); // "ready"
    if (result && result.durationMs >= minDurationMs) onAudio(result);
  }

  const recording = status === "recording";
  const disabled = status === "denied" || status === "unavail";
  const Icon = disabled ? MicOff : status === "requesting" ? AlertCircle : Mic;

  return (
    <div className="mt-3">
      <button
        type="button"
        onPointerDown={onDown}
        onPointerUp={onUpOrLeave}
        onPointerLeave={onUpOrLeave}
        disabled={disabled}
        className={`group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-m border p-3.5 text-[15px] font-semibold tracking-wide transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${
          recording
            ? "text-white"
            : "text-text-1 hover:border-amber-border"
        }`}
        style={
          recording
            ? {
                borderColor: "color-mix(in srgb, var(--red-strong) 70%, #000)",
                background:
                  "linear-gradient(180deg, var(--red) 0%, var(--red-strong) 100%)",
                boxShadow:
                  "0 0 0 4px var(--red-bg), 0 14px 32px -10px var(--red-glow), inset 0 1px 0 rgba(255,255,255,0.22)",
              }
            : {
                borderColor: "var(--border-strong)",
                background: "var(--surface-2)",
              }
        }
      >
        {/* Mic-Bubble */}
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white"
          style={{
            background: recording
              ? "rgba(255,255,255,0.18)"
              : "radial-gradient(circle at 35% 30%, var(--red), color-mix(in srgb, var(--red) 30%, transparent) 70%, transparent)",
            boxShadow: recording
              ? "0 0 0 4px rgba(255,255,255,0.16)"
              : "inset 0 0 0 1px var(--red-border)",
            animation: recording ? "pulse 1s ease-in-out infinite" : undefined,
          }}
        >
          <Icon size={20} strokeWidth={2.2} />
        </span>

        <span className="flex flex-1 flex-col items-start gap-0.5">
          <span>
            {recording
              ? "Diktiere · jetzt sprechen"
              : status === "requesting"
                ? "Mikrofon-Zugriff bestätigen …"
                : status === "denied"
                  ? "Mikrofon im Browser freigeben"
                  : status === "unavail"
                    ? "Kein Mikrofon erkannt"
                    : "Halten zum Diktieren"}
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">
            {recording
              ? `${formatSecs(seconds)} · loslassen zum stoppen`
              : status === "denied"
                ? "Tippe auf das Schloss-Symbol in der URL-Leiste"
                : "Push-to-Talk · whisper · offline"}
          </span>
        </span>

        {/* Live-Timer rechts */}
        {recording ? (
          <span className="font-mono text-[18px] font-bold tabular-nums text-white">
            {formatSecs(seconds)}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function formatSecs(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(1, "0")}:${String(s % 60).padStart(2, "0")}`;
}
