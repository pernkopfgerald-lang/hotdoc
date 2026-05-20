import { MapPin, Play, Siren } from "lucide-react";

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

/**
 * Apple-Style Alarm-Karte mit pulsierendem Siren-Icon, rotem Verlauf,
 * Header-Beacon-Strip und 4 Meta-Zellen (Alarmiert · Ausgerückt · Eingerückt · Stichwort).
 */
export function AlarmCard({ alarm, onPlayAudio }: Props) {
  return (
    <section
      className="relative overflow-hidden p-6 pt-[26px]"
      style={{
        borderRadius: 22,
        background:
          "linear-gradient(135deg, var(--surface) 0%, var(--red-tint) 55%, var(--red-tint-2) 100%)",
        border: "1px solid var(--red-border)",
        boxShadow: "var(--shadow-alarm)",
      }}
    >
      {/* Beacon-Stripe oben */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-0 h-1"
        style={{
          background:
            "linear-gradient(90deg, var(--red) 0%, #E63946 50%, var(--red) 100%)",
        }}
      />

      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          {/* Siren-Icon mit Pulse-Ring */}
          <span
            className="relative grid h-14 w-14 shrink-0 place-items-center rounded-[16px]"
            style={{
              background: "var(--red)",
              boxShadow: "0 4px 12px rgba(200, 16, 46, 0.35)",
            }}
          >
            <Siren size={30} color="#fff" strokeWidth={2.2} />
            <span
              aria-hidden
              className="absolute inset-[-4px] rounded-[20px] border-2"
              style={{
                borderColor: "rgba(200, 16, 46, 0.18)",
                animation: "pulse-ring 1.8s ease-out infinite",
              }}
            />
          </span>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--red)" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: "var(--red)",
                    animation: "blink 1.2s ease-in-out infinite",
                  }}
                />
                Aktiver Alarm
              </span>
              <span
                className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--fg-2)" }}
              >
                · {alarm.alarmierungAuthor} · Stufe 2
              </span>
            </div>
            <h1
              className="text-[32px] font-extrabold leading-[1.1] tracking-tight"
              style={{ color: "var(--fg)" }}
            >
              {alarm.einsatzart}
            </h1>
            <div
              className="mt-1.5 flex items-center gap-1.5 text-[16px] font-medium"
              style={{ color: "var(--fg-2)" }}
            >
              <MapPin size={16} />
              {alarm.einsatzort}
            </div>
          </div>
        </div>
        <div
          className="font-mono text-[12px] font-semibold tracking-[0.05em]"
          style={{ color: "var(--fg-2)" }}
        >
          #{alarm.alarmId}
        </div>
      </div>

      {/* Audio-Button (optional) */}
      {alarm.audioSecs ? (
        <button
          type="button"
          onClick={onPlayAudio}
          className="mb-4 flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.1em] transition"
          style={{
            borderColor: "var(--amber-border)",
            background: "var(--warn-tint)",
            color: "var(--warn)",
          }}
        >
          <Play size={12} fill="currentColor" />
          BlaulichtSMS-Audio · {formatSecs(alarm.audioSecs)}
        </button>
      ) : null}

      {/* 4 Meta-Zellen */}
      <div
        className="grid grid-cols-4 gap-0 rounded-[14px] border px-1 py-3.5"
        style={{
          background: "color-mix(in srgb, var(--surface) 65%, transparent)",
          borderColor: "color-mix(in srgb, var(--red-border) 60%, transparent)",
        }}
      >
        <MetaCell label="Alarmiert" value={formatTime(alarm.alarmierungZeit)} accent />
        <MetaCell label="Ausgerückt" value="—" divided />
        <MetaCell label="Eingerückt" value="– – : – –" placeholder divided />
        <MetaCell label="Distanz" value={`${alarm.distanzKm.toFixed(1)} km`} divided />
      </div>
    </section>
  );
}

function MetaCell({
  label,
  value,
  accent,
  divided,
  placeholder,
}: {
  label: string;
  value: string;
  accent?: boolean;
  divided?: boolean;
  placeholder?: boolean;
}) {
  return (
    <div
      className="px-4"
      style={{
        borderLeft: divided ? "1px solid color-mix(in srgb, var(--red-border) 60%, transparent)" : undefined,
      }}
    >
      <div
        className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
        style={{ color: "var(--fg-3)" }}
      >
        {label}
      </div>
      <div
        className="text-[18px] font-bold tabular-nums tracking-tight"
        style={{
          color: accent ? "var(--red)" : placeholder ? "var(--fg-3)" : "var(--fg)",
        }}
      >
        {value}
      </div>
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
