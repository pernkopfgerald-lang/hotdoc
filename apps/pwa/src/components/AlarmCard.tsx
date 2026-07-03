import { STICHWORT_STUFEN, type StichwortStufe } from "@hotdoc/shared";
import { GraduationCap, MapPin, Play, Plus, Siren } from "lucide-react";

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
 * T-08/U-01 (Audit 2026-07): Typ-Optik zentral — das frühere istUebung-
 * Sonderfall-Muster (#164) verallgemeinert auf ALLE Nicht-Alarm-Typen.
 * Nur "alarm" behält das rote Theme mit Siren + "Aktiver Alarm"; manuell
 * angelegte Einsätze (blau/Plus), Lotsendienste (amber/MapPin) und Übungen
 * (grün/GraduationCap) sind auf einen Blick als "kein BlaulichtSMS-Alarm"
 * erkennbar.
 */
const TYP_OPTIK = {
  uebung: {
    tag: "Übung",
    Icon: GraduationCap,
    farbe: "var(--ok)",
    tint: "var(--ok-tint)",
    border: "var(--ok-border)",
    glow: "var(--glow-ok)",
    bannerShadow: "0 4px 12px -4px rgba(4,120,87,0.45)",
  },
  manuell: {
    tag: "Manuell angelegt",
    Icon: Plus,
    farbe: "var(--info)",
    tint: "var(--info-tint)",
    border: "var(--blue-border)",
    glow: "var(--glow-info)",
    bannerShadow: "0 4px 12px -4px rgba(29,78,216,0.45)",
  },
  lotsendienst: {
    tag: "Lotsendienst",
    Icon: MapPin,
    farbe: "var(--warn)",
    tint: "var(--warn-tint)",
    border: "var(--warn-border)",
    glow: "var(--glow-warn)",
    bannerShadow: "0 4px 12px -4px rgba(180,83,9,0.45)",
  },
} as const;

/**
 * AlarmCard — 1:1 portiert aus claude.ai/design HotDoc Fahrzeugbericht.html.
 * Nutzt die .alarm/.alarm-top/.alarm-icon/.alarm-meta-Klassen aus design.css.
 */
export function AlarmCard({ alarm, onPlayAudio, einsatzTyp }: Props) {
  const optik =
    einsatzTyp && einsatzTyp !== "alarm" ? TYP_OPTIK[einsatzTyp] : null;
  const TypIcon = optik ? optik.Icon : Siren;
  return (
    <section
      className="alarm"
      style={
        optik
          ? {
              // Typ-Optik überschreibt das rote Alarm-Theme.
              background: `linear-gradient(135deg, var(--surface) 0%, ${optik.tint} 55%, color-mix(in srgb, ${optik.farbe} 16%, transparent) 100%)`,
              borderColor: optik.border,
              boxShadow: optik.glow,
            }
          : undefined
      }
    >
      {optik && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 12px",
            borderRadius: "var(--radius-pill)",
            background: optik.farbe,
            color: "#fff",
            fontFamily: "var(--font-mono)",
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            marginBottom: 12,
            boxShadow: optik.bannerShadow,
          }}
        >
          <TypIcon size={14} strokeWidth={2.4} />
          {optik.tag}
        </div>
      )}
      <div className="alarm-top">
        <div className="alarm-left">
          <div
            className="alarm-icon"
            style={optik ? { background: optik.farbe } : undefined}
          >
            <TypIcon size={30} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div className="alarm-tags">
              <span
                className="alarm-tag"
                style={optik ? { color: optik.farbe } : undefined}
              >
                <span
                  className="dot"
                  style={optik ? { background: optik.farbe } : undefined}
                />
                {optik ? optik.tag : "Aktiver Alarm"}
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

      {/* T-07 (Audit 2026-07): Die toten "Ausgerückt/Eingerückt – – : – –"-
          Zellen sind ersatzlos raus — die Zeiten wurden nirgends befüllt und
          gaukelten ein Feature vor. Grid per Inline-Style auf 2 Spalten
          (die .alarm-meta-Klasse mit 4 Spalten hat weitere Konsumenten);
          borderBottom: 0 neutralisiert die Mobile-Zweizeilen-Regel
          (nth-child(-n+2)), die mit nur einer Zeile einen Streu-Border
          zeichnen würde. */}
      <div className="alarm-meta" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="cell" style={{ borderBottom: 0 }}>
          <div className="lbl">Alarmiert</div>
          <div className="val red">{formatTime(alarm.alarmierungZeit)}</div>
        </div>
        <div
          className="cell"
          style={{ borderBottom: 0 }}
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
