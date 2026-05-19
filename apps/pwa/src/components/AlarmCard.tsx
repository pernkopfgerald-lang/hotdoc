import { Play } from "lucide-react";

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
      className="rounded-m border bg-surface-1 p-3.5"
      style={{
        background:
          "radial-gradient(800px 200px at -10% -20%, var(--red-bg), transparent 50%), radial-gradient(600px 200px at 110% 120%, var(--blue-bg), transparent 60%), var(--surface-1)",
        borderColor: "var(--red-border)",
      }}
    >
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-text-2">
          <span
            className="inline-block h-2 w-2 rounded-full bg-red"
            style={{ boxShadow: "0 0 12px var(--red-glow)", animation: "pulse 1.4s ease-in-out infinite" }}
          />
          Aktiver Alarm
          <span className="ml-auto font-mono text-[10px] text-text-3">#{alarm.alarmId}</span>
        </div>
        {alarm.audioSecs ? (
          <button
            type="button"
            onClick={onPlayAudio}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 font-mono text-[11px] font-medium text-text-1 transition hover:bg-surface-3"
          >
            <Play size={12} fill="currentColor" />
            Audio ({formatSecs(alarm.audioSecs)})
          </button>
        ) : null}
      </header>

      <h1 className="font-condensed text-[28px] font-bold leading-[1.05] tracking-tight text-text-1">
        {alarm.einsatzart}
      </h1>
      <p className="mb-3 mt-1 text-sm text-text-2">{alarm.einsatzort}</p>

      <dl className="grid grid-cols-3 gap-px border-t border-border pt-2.5">
        <MetaCell label="Alarmiert" value={`${formatTime(alarm.alarmierungZeit)} · ${alarm.alarmierungAuthor}`} />
        <MetaCell label="Distanz" value={`${alarm.distanzKm.toFixed(1)} km`} className="border-l border-border pl-3" />
        <MetaCell
          label="Koord."
          value={`${alarm.koordinaten.lat.toFixed(3)}, ${alarm.koordinaten.lng.toFixed(3)}`}
          className="border-l border-border pl-3 font-mono"
        />
      </dl>
    </section>
  );
}

function MetaCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className ?? ""}>
      <dt className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-text-3">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 text-[13px] font-medium text-text-1">{value}</dd>
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
