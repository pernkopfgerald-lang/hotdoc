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
  stichwort?: string;
}

interface Props {
  alarm: AlarmDaten;
  onPlayAudio?: () => void;
}

/**
 * AlarmCard — 1:1 portiert aus claude.ai/design HotDoc Fahrzeugbericht.html.
 * Nutzt die .alarm/.alarm-top/.alarm-icon/.alarm-meta-Klassen aus design.css.
 */
export function AlarmCard({ alarm, onPlayAudio }: Props) {
  return (
    <section className="alarm">
      <div className="alarm-top">
        <div className="alarm-left">
          <div className="alarm-icon">
            <Siren size={30} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div className="alarm-tags">
              <span className="alarm-tag">
                <span className="dot" />
                Aktiver Alarm
              </span>
              <span className="alarm-tag muted">
                · {alarm.alarmierungAuthor} · Stufe 2
              </span>
            </div>
            <div className="alarm-title">{alarm.einsatzart}</div>
            <div className="alarm-addr">
              <MapPin size={16} />
              {alarm.einsatzort}
            </div>
          </div>
        </div>
        <div className="alarm-no">#{alarm.alarmId}</div>
      </div>

      {alarm.audioSecs ? (
        <button
          type="button"
          onClick={onPlayAudio}
          className="badge warn"
          style={{ marginBottom: 12, gap: 6, cursor: "pointer" }}
        >
          <Play size={11} fill="currentColor" />
          BlaulichtSMS-Audio · {formatSecs(alarm.audioSecs)}
        </button>
      ) : null}

      <div className="alarm-meta">
        <div className="cell">
          <div className="lbl">Alarmiert</div>
          <div className="val red">{formatTime(alarm.alarmierungZeit)}</div>
        </div>
        <div className="cell">
          <div className="lbl">Ausgerückt</div>
          <div className="val muted">– – : – –</div>
        </div>
        <div className="cell">
          <div className="lbl">Eingerückt</div>
          <div className="val muted">– – : – –</div>
        </div>
        <div className="cell">
          <div className="lbl">Stichwort</div>
          <div className="val">{alarm.stichwort ?? "B 2"}</div>
        </div>
      </div>
    </section>
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
