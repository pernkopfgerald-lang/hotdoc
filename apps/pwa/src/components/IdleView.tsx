import { AlertTriangle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

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
    // BLOCKER-2b+3 (Audit 2026-06-03): lokal + Offline-Outbox gesichert,
    // Upload wird automatisch nachgereicht sobald Netz da ist.
    | { kind: "queued" }
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
      }}
    >
      {/* ─── Status ─── schlichter Block statt Hero-Grafik ──── */}
      <section className="card">
        <div className="card-head">
          <div className="card-title">Bereit</div>
          <div className="card-meta">{funkrufname}</div>
        </div>
        <p style={{ margin: 0, fontSize: 18, lineHeight: 1.45, color: "var(--fg)" }}>
          Kein aktiver Einsatz. Bei einem Alarm öffnet sich der Bericht automatisch.
          Ohne Alarm kannst du unten selbst einen Bericht starten.
        </p>
      </section>

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
            border: "1px solid var(--glass-border)",
            color: "var(--fg-2)",
            fontSize: 15.5,
            fontFamily: "var(--font-mono)",
            letterSpacing: "var(--tracking-caps)",
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
            color: "var(--red)",
            fontSize: 15.5,
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
                fontSize: 14,
                fontWeight: 700,
                minHeight: 30,
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
            fontSize: 14.5,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            letterSpacing: "var(--tracking-caps)",
          }}
        >
          <CheckCircle2 size={13} />
          Vorheriger Bericht übertragen · {syncState.at}
        </div>
      ) : null}

      {/* BLOCKER-2b+3 (Audit 2026-06-03): Bericht ist lokal + in der Offline-
          Outbox gesichert, wird automatisch nachgereicht. Ehrliche Anzeige
          statt falschem "übertragen". */}
      {syncState && syncState.kind === "queued" ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: "var(--radius-s)",
            background: "var(--amber-soft)",
            border: "1px solid var(--amber-border)",
            color: "var(--amber)",
            fontSize: 14.5,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            letterSpacing: "var(--tracking-caps)",
          }}
        >
          <UploadCloud size={13} />
          Bericht lokal gesichert — wird gesendet sobald Netz
        </div>
      ) : null}

      {/* ─── Bericht starten ─── dunkelgraue Schaltflaechen, 2x2 ────
          Tablet-Wunsch (2026-06-03): festes 2x2-Raster, grosse Flaechen →
          mit Handschuh gut zu treffen. Subtexte als konkrete Beispiele. */}
      <div className="section-head" style={{ paddingTop: 0 }}>
        <span className="h">Bericht starten</span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        <QuickActionCard
          label="Einsatz ohne Alarm"
          sub="z. B. Türöffnung, Tierrettung"
          onClick={() => onNeuerBericht("manuell")}
        />
        <QuickActionCard
          label="Übung"
          sub="Schulung, Atemschutz-Training"
          onClick={() => onNeuerBericht("uebung")}
        />
        <QuickActionCard
          label="Lotsendienst"
          sub="Begleitung für Polizei/Rettung"
          onClick={() => onNeuerBericht("lotsendienst")}
        />
        <QuickActionCard label="Archiv" sub="letzte Berichte ansehen" onClick={onArchiv} />
      </div>
    </div>
  );
}

function QuickActionCard({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
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
        justifyContent: "center",
        gap: 6,
        padding: "22px 22px",
        borderRadius: "var(--radius-m)",
        border: "1px solid var(--btn)",
        background: "var(--btn)",
        color: "var(--btn-fg)",
        cursor: "pointer",
        textAlign: "left",
        minHeight: 110,
      }}
    >
      <span style={{ fontSize: 24, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 15.5, fontWeight: 400, lineHeight: 1.35 }}>{sub}</span>
    </button>
  );
}
