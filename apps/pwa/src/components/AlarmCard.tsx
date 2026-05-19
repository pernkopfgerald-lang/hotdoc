import { Play, Siren } from "lucide-react";

export interface AlarmDaten {
  alarmId: string;
  einsatzart: string;
  einsatzort: string;
  alarmierungZeit: string;
  alarmierungAuthor: string;
  koordinaten: { lat: number; lng: number };
  distanzKm: number;
  audioSecs?: number;
}

interface Props {
  alarm: AlarmDaten;
  onPlayAudio?: () => void;
}

export function AlarmCard({ alarm, onPlayAudio }: Props) {
  return (
    <section
      className="relative overflow-hidden rounded-m border"
      style={{
        borderColor: "var(--red-border)",
        background:
          "radial-gradient(900px 320px at 0% 0%, var(--red-bg) 0%, transparent 55%), " +
          "linear-gradient(180deg, var(--surface-1) 0%, color-mix(in srgb, var(--surface-1) 82%, #000) 100%)",
        boxShadow: "0 24px 60px -32px var(--red-glow), 0 1px 0 rgba(255,255,255,0.04) inset",
      }}
    >
      {/* Roter Beacon-Balken oben — leuchtet pulsierend */}
      <div
        aria-hidden
        className="h-[3px] w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--red) 18%, var(--red) 82%, transparent 100%)",
          animation: "beacon 2.4s ease-in-out infinite",
        }}
      />

      <div className="p-4">
        <header className="mb-3 flex items-center gap-3">
          <span
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md border text-white"
            style={{
              background: "linear-gradient(135deg, var(--red) 0%, var(--red-strong) 100%)",
              borderColor: "color-mix(in srgb, var(--red-strong) 70%, #000)",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.08) inset, 0 0 18px -2px var(--red-glow)",
            }}
          >
            <Siren size={20} strokeWidth={2.2} />
          </span>
          <div className="flex flex-1 items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--red)" }}>
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                background: "var(--red)",
                boxShadow: "0 0 10px var(--red-glow)",
                animation: "pulse 1.2s ease-in-out infinite",
              }}
            />
            Aktiver Alarm
            <span className="text-text-3">·</span>
            <span className="text-text-2">{alarm.alarmierungAuthor}</span>
            <span className="ml-auto text-text-3 normal-case tracking-normal">#{alarm.alarmId}</span>
          </div>
        </header>

        <h1
          className="font-condensed text-[32px] font-bold leading-[1] tracking-tight text-text-1"
          style={{ textShadow: "0 1px 0 rgba(0,0,0,0.4)" }}
        >
          {alarm.einsatzart}
        </h1>
        <p className="mb-4 mt-1.5 text-[14px] text-text-2">{alarm.einsatzort}</p>

        {alarm.audioSecs ? (
          <button
            type="button"
            onClick={onPlayAudio}
            className="mb-4 flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition"
            style={{
              borderColor: "var(--amber-border)",
              background: "var(--amber-soft)",
              color: "var(--amber)",
            }}
          >
            <Play size={12} fill="currentColor" />
            BlaulichtSMS-Audio · {formatSecs(alarm.audioSecs)}
          </button>
        ) : null}

        <dl
          className="grid grid-cols-3 gap-0 overflow-hidden rounded-s border"
          style={{ borderColor: "var(--border)" }}
        >
          <MetaCell label="Alarmiert um" value={formatTime(alarm.alarmierungZeit)} accent />
          <MetaCell
            label="Distanz"
            value={`${alarm.distanzKm.toFixed(1)} km`}
            divided
          />
          <MetaCell
            label="Koord."
            value={`${alarm.koordinaten.lat.toFixed(3)}, ${alarm.koordinaten.lng.toFixed(3)}`}
            divided
            mono
          />
        </dl>
      </div>
    </section>
  );
}

function MetaCell({
  label,
  value,
  divided,
  accent,
  mono,
}: {
  label: string;
  value: string;
  divided?: boolean;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: accent
          ? "color-mix(in srgb, var(--red-bg) 60%, transparent)"
          : "color-mix(in srgb, var(--surface-2) 60%, transparent)",
        borderLeft: divided ? "1px solid var(--border)" : undefined,
      }}
    >
      <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
        {label}
      </dt>
      <dd
        className={`m-0 mt-0.5 text-[14px] font-semibold tabular-nums text-text-1 ${
          mono ? "font-mono text-[12px]" : ""
        }`}
        style={accent ? { color: "var(--red)" } : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return iso;
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function formatSecs(s: number): string {
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
