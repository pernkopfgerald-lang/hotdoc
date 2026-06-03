import { STICHWORT_STUFEN, type StichwortStufe } from "@hotdoc/shared";
import { GraduationCap, MapPin, Play, Siren } from "lucide-react";

export interface AlarmDaten {
  alarmId: string;
  einsatzart: string;
  einsatzort: string;
  alarmierungZeit: string;
  alarmierungAuthor: string;
  koordinaten: { lat: number; lng: number };
  distanzKm: number;
  audioSecs?: number;
  /** Klassifizierungs-Stufe — siehe STICHWORT_STUFEN für Tooltips. */
  stichwort?: StichwortStufe;
}

interface Props {
  alarm: AlarmDaten;
  onPlayAudio?: () => void;
  /** #164 (Test 2026-06-03): Bei einer Übung wird die Karte GRÜN dargestellt
   *  + "ÜBUNG"-Banner statt rotem "Aktiver Alarm" — auch in der Fahrzeug-
   *  Ansicht muss sofort klar sein, dass es kein echter Einsatz ist. */
  einsatzTyp?: "alarm" | "manuell" | "lotsendienst" | "uebung";
}

/**
 * AlarmCard — 1:1 portiert aus claude.ai/design HotDoc Fahrzeugbericht.html.
 * Nutzt die .alarm/.alarm-top/.alarm-icon/.alarm-meta-Klassen aus design.css.
 */
export function AlarmCard({ alarm, onPlayAudio, einsatzTyp }: Props) {
  const istUebung = einsatzTyp === "uebung";
  return (
    <section
      className="alarm"
      style={
        istUebung
          ? {
              // Grüne Übungs-Optik überschreibt das rote Alarm-Theme.
              background:
                "linear-gradient(135deg, var(--surface) 0%, var(--ok-tint) 55%, color-mix(in srgb, var(--ok) 16%, transparent) 100%)",
              borderColor: "var(--ok-border)",
              boxShadow: "var(--glow-ok)",
            }
          : undefined
      }
    >
      {istUebung && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 12px",
            borderRadius: "var(--radius-pill)",
            background: "var(--ok)",
            color: "#fff",
            fontFamily: "var(--font-mono)",
            fontWeight: 800,
            fontSize: 11,
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            marginBottom: 12,
            boxShadow: "0 4px 12px -4px rgba(4,120,87,0.45)",
          }}
        >
          <GraduationCap size={14} strokeWidth={2.4} />
          Übung
        </div>
      )}
      <div className="alarm-top">
        <div className="alarm-left">
          <div
            className="alarm-icon"
            style={istUebung ? { background: "var(--ok)" } : undefined}
          >
            {istUebung ? (
              <GraduationCap size={30} color="#fff" strokeWidth={2} />
            ) : (
              <Siren size={30} color="#fff" strokeWidth={2} />
            )}
          </div>
          <div>
            <div className="alarm-tags">
              <span
                className="alarm-tag"
                style={istUebung ? { color: "var(--ok)" } : undefined}
              >
                <span
                  className="dot"
                  style={istUebung ? { background: "var(--ok)" } : undefined}
                />
                {istUebung ? "Übung" : "Aktiver Alarm"}
              </span>
              <span className="alarm-tag muted">
                · {alarm.alarmierungAuthor}
                {alarm.stichwort ? ` · ${alarm.stichwort}` : ""}
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
        <div
          className="cell"
          title={
            alarm.stichwort
              ? STICHWORT_STUFEN[alarm.stichwort]
              : "Klassifizierungs-Stufe (B-1/B-2/B-3 Brand · T-1/T-2/T-3 Technisch)"
          }
        >
          <div className="lbl">Stichwort</div>
          <div className="val">{alarm.stichwort ?? "—"}</div>
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
