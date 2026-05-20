import { MicOff, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MicRecorder, type MicStatus, type RecordingResult } from "../lib/audio";

interface Props {
  onAudio: (result: RecordingResult) => void;
  minDurationMs?: number;
}

/**
 * Press-and-Hold-Diktat-Button — Design `.dictate` mit `.dictate-btn` +
 * `.dictate-text` (t1/t2) + animierte `.dictate-wave`-Visualisierung.
 * Sammelt echtes Audio via MediaRecorder (siehe lib/audio.ts).
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
    if (rec.status === "idle" || rec.status === "error") {
      setStatus("requesting");
      const next = await rec.prepare();
      setStatus(next);
      if (next !== "ready") return;
    } else if (rec.status === "denied" || rec.status === "unavail") {
      setStatus(rec.status);
      return;
    }
    if (!rec.start()) return;
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
    setStatus(rec.status);
    if (result && result.durationMs >= minDurationMs) onAudio(result);
  }

  const recording = status === "recording";
  const disabled = status === "denied" || status === "unavail";

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
      ? "Im Browser freigeben"
      : "Push-to-Talk · Whisper · offline";

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
