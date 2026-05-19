import { Mic } from "lucide-react";
import { useRef, useState } from "react";

interface Props {
  /** Wird aufgerufen wenn der Press-and-Hold losgelassen wird. */
  onDictate: () => void;
}

/**
 * Press-and-Hold-Diktat-Button. In Phase 5 wird hier echtes MediaRecorder
 * + whisper.cpp WASM integriert. Aktuell: simuliert die Aufnahme und ruft
 * `onDictate()` beim Loslassen.
 */
export function DictateButton({ onDictate }: Props) {
  const [recording, setRecording] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    if (recording) return;
    setRecording(true);
  }
  function stop() {
    if (!recording) return;
    setRecording(false);
    onDictate();
  }
  function onDown() {
    pressTimer.current = setTimeout(start, 120);
  }
  function onUpOrLeave() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (recording) stop();
  }

  return (
    <button
      type="button"
      onPointerDown={onDown}
      onPointerUp={onUpOrLeave}
      onPointerLeave={onUpOrLeave}
      className={`relative mt-2.5 flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-m border bg-surface-2 p-3.5 text-[15px] font-medium tracking-wide text-text-1 transition ${
        recording
          ? "border-red/70 bg-red/10"
          : "border-border-strong hover:border-red/45"
      }`}
    >
      <span
        className={`grid h-[38px] w-[38px] place-items-center rounded-full text-white ${
          recording ? "animate-pulse" : ""
        }`}
        style={{
          background:
            "radial-gradient(circle at 35% 30%, var(--red), color-mix(in srgb, var(--red) 30%, transparent) 70%, transparent)",
          boxShadow: "inset 0 0 0 1px var(--red-border)",
        }}
      >
        <Mic size={20} />
      </span>
      <span>{recording ? "Diktiere …" : "Halten zum Diktieren"}</span>
    </button>
  );
}
