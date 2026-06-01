import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  GraduationCap,
  Loader2,
  MapPin,
  Plus,
  Radio,
  UploadCloud,
} from "lucide-react";

interface Props {
  funkrufname: string;
  /** Quick-Action: neuer Einsatz/Übung/Lotsendienst — öffnet Modal mit Typ-Vorwahl. */
  onNeuerBericht: (typ: "manuell" | "uebung" | "lotsendienst") => void;
  /** Quick-Action: Archiv öffnen — read-only Liste der letzten Berichte. */
  onArchiv: () => void;
  /** Upload-Status des letzten Berichts — wird als dezentes Inline-Hinweis-
   *  Bändchen über den Quick-Actions gezeigt, NICHT als dominierende Karte. */
  syncState?:
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "ok"; einsatzId: string; at: string }
    | { kind: "error"; msg: string };
  /** Manueller Retry — nur sichtbar wenn syncState=error. */
  onRetryUpload?: () => void;
}

/**
 * Reine Idle-Anzeige zwischen Einsätzen.
 *
 * Bewusst KEIN Hinweis auf den vorherigen Bericht — der Kdt. hat den
 * abgeschlossen, alles weitere passiert auf der Florianstation oder im
 * Archiv. Der Idle-Screen ist ein „Tablet bereit, ich warte" — er bietet:
 *
 *   - die Möglichkeit, einen neuen Bericht selbst zu starten (manuell,
 *     Übung, Lotsendienst), ohne auf einen Alarm warten zu müssen,
 *   - einen schnellen Blick ins Archiv,
 *   - Sync-Feedback wenn der vorherige Upload noch hängt (nur dann).
 *
 * Bei jedem neuen aktiven Backend-Einsatz (Alarm oder Florianstation-
 * Anlage) wechselt die App auto-magisch zur Bericht-Page — der Idle-Screen
 * verschwindet ohne Klick.
 */
export function IdleView({
  funkrufname,
  onNeuerBericht,
  onArchiv,
  syncState,
  onRetryUpload,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 22,
        paddingTop: 8,
        animation: "glass-reveal 320ms var(--ease-decel) both",
      }}
    >
      {/* ─── Hero ─── ruhig, kein Alarm, klares „bereit" ──── */}
      <header
        style={{
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          padding: "12px 0 4px",
        }}
      >
        <div
          className="idle-radio-glow"
          style={{
            position: "relative",
            display: "grid",
            placeItems: "center",
            width: 76,
            height: 76,
            borderRadius: 22,
            background: "var(--glass-2)",
            backdropFilter: "var(--blur-2)",
            WebkitBackdropFilter: "var(--blur-2)",
            border: "1px solid var(--glass-border)",
            // D-09: 60px-Halo nur im Default-Light. Lite-Mode killt den
            // Glow via .idle-radio-glow-Override in design.css.
            boxShadow: "var(--glass-shadow-2), 0 0 60px -16px var(--emerald-glow)",
            color: "var(--ok)",
          }}
        >
          <Radio size={32} strokeWidth={2} />
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--ok)",
              boxShadow: "0 0 0 0 var(--emerald-glow)",
              animation: "breathe 2.4s ease-in-out infinite",
            }}
          />
        </div>
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "var(--tracking-display)",
              color: "var(--fg)",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            Bereit
          </h1>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "var(--tracking-caps)",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginTop: 6,
            }}
          >
            {funkrufname} · kein aktiver Einsatz
          </div>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--fg-2)",
            maxWidth: 420,
            lineHeight: 1.5,
            letterSpacing: "var(--tracking-ui)",
          }}
        >
          Bei BlaulichtSMS-Alarm öffnet sich das Formular automatisch.
          Sonst kannst du hier selbst einen Bericht starten.
        </p>
      </header>

      {/* ─── Sync-Status (nur sichtbar wenn nicht idle/ok-länger-als-Sekunden) ─ */}
      {syncState && syncState.kind === "uploading" ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: "var(--radius-s)",
            background: "var(--glass-3)",
            backdropFilter: "var(--blur-3)",
            WebkitBackdropFilter: "var(--blur-3)",
            border: "1px solid var(--glass-border)",
            color: "var(--fg-2)",
            fontSize: 12.5,
            fontFamily: "var(--font-mono)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            justifyContent: "center",
          }}
        >
          <Loader2 size={14} className="animate-spin" />
          Vorheriger Bericht wird übertragen …
        </div>
      ) : null}

      {syncState && syncState.kind === "error" ? (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderRadius: "var(--radius-s)",
            background: "var(--red-tint)",
            border: "1px solid var(--red-border)",
            boxShadow: "var(--glow-red-soft)",
            color: "var(--red)",
            fontSize: 12.5,
            fontWeight: 600,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <AlertTriangle size={14} />
          <span>Letzter Bericht nicht übertragen: {syncState.msg}</span>
          {onRetryUpload ? (
            <button
              type="button"
              onClick={onRetryUpload}
              className="icon-btn danger"
              style={{
                width: "auto",
                padding: "0 10px",
                gap: 6,
                display: "inline-flex",
                alignItems: "center",
                fontSize: 11,
                fontWeight: 700,
                minHeight: 30,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <UploadCloud size={12} />
              Erneut versuchen
            </button>
          ) : null}
        </div>
      ) : null}

      {syncState && syncState.kind === "ok" ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: "var(--radius-s)",
            background: "var(--ok-tint)",
            border: "1px solid var(--ok-border)",
            color: "var(--ok)",
            fontSize: 11.5,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
          }}
        >
          <CheckCircle2 size={13} />
          Vorheriger Bericht übertragen · {syncState.at}
        </div>
      ) : null}

      {/* ─── Quick-Actions ─── 4 große Touch-Cards ──── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <QuickActionCard
          Icon={Plus}
          label="Neuer Einsatz"
          sub="manuell · ohne Alarm"
          color="var(--info)"
          glow="var(--glow-info)"
          onClick={() => onNeuerBericht("manuell")}
        />
        <QuickActionCard
          Icon={GraduationCap}
          label="Übung"
          sub="Training · AS-Stunden"
          color="var(--ok)"
          glow="var(--glow-ok)"
          onClick={() => onNeuerBericht("uebung")}
        />
        <QuickActionCard
          Icon={MapPin}
          label="Lotsendienst"
          sub="meist verrechenbar"
          color="var(--warn)"
          glow="var(--glow-warn)"
          onClick={() => onNeuerBericht("lotsendienst")}
        />
        <QuickActionCard
          Icon={Archive}
          label="Archiv"
          sub="letzte Berichte"
          color="var(--fg-2)"
          glow="0 12px 28px -8px rgba(15,23,42,0.32)"
          onClick={onArchiv}
        />
      </div>
    </div>
  );
}

function QuickActionCard({
  Icon,
  label,
  sub,
  color,
  glow,
  onClick,
}: {
  Icon: typeof Plus;
  label: string;
  sub: string;
  color: string;
  glow: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 8,
        padding: "18px 18px 20px",
        borderRadius: "var(--radius-l)",
        border: "1px solid var(--glass-border)",
        background: "var(--glass-2)",
        backdropFilter: "var(--blur-2)",
        WebkitBackdropFilter: "var(--blur-2)",
        boxShadow: "var(--glass-shadow-2)",
        cursor: "pointer",
        textAlign: "left",
        transition:
          "transform 180ms var(--ease-smooth), box-shadow 180ms var(--ease-smooth), border-color 180ms var(--ease-smooth)",
        color: "var(--fg)",
        minHeight: 120,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `var(--glass-shadow-2), ${glow}`;
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "var(--glass-shadow-2)";
        e.currentTarget.style.borderColor = "var(--glass-border)";
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 44,
          height: 44,
          borderRadius: 12,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color,
        }}
      >
        <Icon size={22} strokeWidth={2.2} />
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: "var(--tracking-tight)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "var(--tracking-caps)",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        {sub}
      </span>
    </button>
  );
}
