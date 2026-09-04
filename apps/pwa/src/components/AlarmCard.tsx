import { STICHWORT_STUFEN, type StichwortStufe } from "@hotdoc/shared";
import { AlertTriangle, GraduationCap, MapPin, Play, Plus, Siren } from "lucide-react";

export interface AlarmDaten {
  alarmId: string;
  einsatzart: string;
  einsatzort: string;
  alarmierungZeit: string;
  alarmierungAuthor: string;
  /**
   * N-07 (Audit 2026-09): null = (noch) keine Koordinaten bekannt — manuell
   * ohne Adresse angelegt oder BlaulichtSMS ohne Geocode-Treffer. Vorher
   * wurde still das Feuerwehrhaus eingesetzt und als Einsatzort synchronisiert.
   */
  koordinaten: { lat: number; lng: number } | null;
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
  /**
   * N-07 (Audit 2026-09): weder Koordinaten noch eine echte Adresse bekannt
   * → amber Hinweis mit Handlungsanweisung (Adresse tippen / GPS vor Ort).
   */
  einsatzortFehlt?: boolean;
  /**
   * S-14 (Audit 2026-09): der BlaulichtSMS-Poller hat diesen Einsatz als
   * möglichen Doppelalarm markiert (moeglichesDuplikatVon gesetzt) — die
   * Florianstation prüft und führt ggf. zusammen. Amber Hinweis.
   */
  moeglichesDuplikat?: boolean;
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
export function AlarmCard({
  alarm,
  onPlayAudio,
  einsatzTyp,
  einsatzortFehlt,
  moeglichesDuplikat,
}: Props) {
  const optik =
    einsatzTyp && einsatzTyp !== "alarm" ? TYP_OPTIK[einsatzTyp] : null;
  const TypIcon = optik ? optik.Icon : Siren;
  // E-05/E-06 (Audit 2026-09): Nur ein echter BlaulichtSMS-Alarm hat einen
  // Alarm-Author ("BWST"), ein Stichwort (B-1 …) und eine Alarm-Nummer.
  // Bei Übung/Lotsendienst/manuell waren das leere bzw. irreführende
  // Zellen ("BWST", "Stichwort —", "#manuell-…").
  const istAlarm = optik === null;
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
              {istAlarm ? (
                <span className="alarm-tag muted">
                  · {alarm.alarmierungAuthor}
                  {alarm.stichwort ? ` · ${alarm.stichwort}` : ""}
                </span>
              ) : null}
            </div>
            <div className="alarm-title">{alarm.einsatzart}</div>
            <div className="alarm-addr">
              <MapPin size={16} />
              {alarm.einsatzort}
            </div>
          </div>
        </div>
        {istAlarm ? <div className="alarm-no">#{alarm.alarmId}</div> : null}
      </div>

      {/* S-14 + N-07 (Audit 2026-09): amber Hinweise — sichtbar, nicht
          blockierend. Doppelalarm: Florian prüft/führt zusammen. Kein
          Einsatzort: der Kdt tippt die Adresse oder nimmt vor Ort GPS. */}
      {moeglichesDuplikat ? (
        <AmberHinweis text="Möglicher Doppelalarm — Florian prüft" />
      ) : null}
      {einsatzortFehlt ? (
        <AmberHinweis text="Kein Einsatzort — Adresse tippen oder GPS vor Ort" />
      ) : null}

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
      {/* E-05 (Audit 2026-09): "Alarmiert" + Stichwort nur beim Alarm —
          ein manuell angelegter Bericht wurde "angelegt", und ein
          Stichwort hat er nie. */}
      <div
        className="alarm-meta"
        style={{ gridTemplateColumns: istAlarm ? "repeat(2, 1fr)" : "1fr" }}
      >
        <div className="cell" style={{ borderBottom: 0 }}>
          <div className="lbl">{istAlarm ? "Alarmiert" : "Angelegt"}</div>
          <div className={istAlarm ? "val red" : "val"}>
            {formatTime(alarm.alarmierungZeit)}
          </div>
        </div>
        {istAlarm ? (
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
        ) : null}
      </div>
    </section>
  );
}

/** Amber Hinweiszeile in der AlarmCard (S-14 Doppelalarm, N-07 Einsatzort). */
function AmberHinweis({ text }: { text: string }) {
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 10,
        padding: "8px 12px",
        borderRadius: "var(--radius-s)",
        border: "1px solid var(--amber-border)",
        background: "var(--amber-soft)",
        color: "var(--amber)",
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1.35,
      }}
    >
      <AlertTriangle size={16} style={{ flexShrink: 0 }} />
      <span>{text}</span>
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
