import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  UploadCloud,
} from "lucide-react";

interface Props {
  funkrufname: string;
  abgeschlossenAm: string;
  /** Wer hat abgeschlossen (Funkrufname-Kdt., oder leer wenn unbekannt) */
  durch?: string;
  summary: { label: string; value: string }[];
  /** Nur Funktionäre dürfen Reaktivieren — UI-Hint, Server validiert */
  onReaktivieren?: () => void;
  onSwitchFahrzeug: () => void;
  /** Upload-Status des Berichts ins Backend. */
  syncState?:
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "ok"; einsatzId: string; at: string }
    // BLOCKER-2b+3 (Audit 2026-06-03): Bericht ist lokal + in der Offline-Outbox
    // gesichert, der Upload wird automatisch nachgereicht sobald Netz da ist.
    | { kind: "queued" }
    | { kind: "error"; msg: string };
  /** Manueller Retry für den Upload (nur sichtbar wenn syncState=error). */
  onRetryUpload?: () => void;
  /** Quick-Action: neuer Einsatz/Übung/Lotsendienst — öffnet Modal mit Typ-Vorwahl. */
  onNeuerBericht?: (typ: "manuell" | "uebung" | "lotsendienst") => void;
  /** Quick-Action: Archiv öffnen — read-only Liste der letzten Berichte. */
  onArchiv?: () => void;
}

/**
 * Read-Only-Anzeige nach Abschluss. Schreibschutz aktiv — Re-Aktivierung
 * nur durch Funktionär möglich (Server-side check in FR-14).
 */
export function AbgeschlossenView({
  funkrufname,
  abgeschlossenAm,
  durch,
  summary,
  onReaktivieren,
  onSwitchFahrzeug,
  syncState,
  onRetryUpload,
  onNeuerBericht,
  onArchiv,
}: Props) {
  return (
    <div
      className="relative mt-4 overflow-hidden rounded-l border p-5"
      style={{
        borderColor: "var(--emerald-border)",
        background: "var(--card-gradient)",
        boxShadow: "0 24px 60px -32px var(--emerald-glow), var(--shadow-card)",
      }}
    >
      {/* Grüner Beacon — Bericht ist im Trockenen */}
      <div
        aria-hidden
        className="absolute left-0 top-0 h-[3px] w-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--emerald) 18%, var(--emerald) 82%, transparent 100%)",
        }}
      />

      <header className="flex items-center gap-3">
        <span
          className="grid h-12 w-12 place-items-center rounded-md text-white"
          style={{
            background: "linear-gradient(135deg, var(--emerald) 0%, color-mix(in srgb, var(--emerald) 50%, #000) 100%)",
            boxShadow: "0 0 22px -2px var(--emerald-glow)",
          }}
        >
          <CheckCircle2 size={26} strokeWidth={2.2} />
        </span>
        <div className="flex flex-col leading-tight">
          <h2 className="font-condensed text-[22px] font-bold tracking-tight text-text-1">
            Bericht abgeschlossen
          </h2>
          <span
            className="mt-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "var(--emerald)" }}
          >
            {funkrufname} · {durch ? `geschlossen durch ${durch}` : "an Zentrale übergeben"}
          </span>
          <span className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
            <Lock size={10} /> Schreibschutz aktiv · {formatStamp(abgeschlossenAm)}
          </span>
        </div>
      </header>

      <dl
        className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-s border"
        style={{ borderColor: "var(--border-strong)" }}
      >
        {summary.map((s, i) => (
          <div
            key={i}
            className="px-3 py-2.5"
            style={{
              background: "color-mix(in srgb, var(--surface-2) 70%, transparent)",
              borderLeft: i % 2 === 1 ? "1px solid var(--border)" : undefined,
              borderTop: i >= 2 ? "1px solid var(--border)" : undefined,
            }}
          >
            <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
              {s.label}
            </dt>
            <dd className="m-0 mt-0.5 text-[15px] font-bold tabular-nums text-text-1">{s.value}</dd>
          </div>
        ))}
      </dl>

      {syncState && syncState.kind !== "idle" ? (
        <div
          className="mt-4 flex items-center gap-3 rounded-s border px-3 py-2"
          style={{
            borderColor:
              syncState.kind === "ok"
                ? "var(--emerald-border)"
                : syncState.kind === "error"
                  ? "var(--red-border)"
                  : syncState.kind === "queued"
                    ? "var(--amber-border)"
                    : "var(--border-strong)",
            background:
              syncState.kind === "ok"
                ? "var(--ok-tint)"
                : syncState.kind === "error"
                  ? "var(--red-tint)"
                  : syncState.kind === "queued"
                    ? "var(--amber-soft)"
                    : "var(--surface-2)",
          }}
        >
          {syncState.kind === "uploading" ? (
            <>
              <Loader2 size={14} className="animate-spin" style={{ color: "var(--fg-2)" }} />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-2">
                Bericht wird an Florian übermittelt …
              </span>
            </>
          ) : syncState.kind === "ok" ? (
            <>
              <UploadCloud size={14} style={{ color: "var(--emerald)" }} />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--emerald)" }}>
                Im Backend gespeichert · {syncState.at}
              </span>
            </>
          ) : syncState.kind === "queued" ? (
            // BLOCKER-2b+3: ehrliche Meldung — der Bericht ist sicher (lokal +
            // Outbox), aber noch nicht im Backend. Kein "gespeichert"-Trugschluss.
            <>
              <UploadCloud size={14} style={{ color: "var(--amber)" }} />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--amber)" }}>
                Lokal gesichert — wird automatisch an Florian gesendet sobald Netz
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={14} style={{ color: "var(--red)" }} />
              <span className="flex-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--red)" }}>
                Upload fehlgeschlagen: {syncState.msg}
              </span>
              {onRetryUpload ? (
                <button
                  type="button"
                  onClick={onRetryUpload}
                  className="rounded border px-2 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: "var(--red-border)",
                    background: "var(--red-tint)",
                    color: "var(--red)",
                  }}
                >
                  Erneut versuchen
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onSwitchFahrzeug}
          className="flex-1 rounded-m border px-3 py-2.5 text-sm font-semibold text-text-1 transition active:translate-y-px"
          style={{ borderColor: "var(--border-strong)", background: "var(--surface-2)" }}
        >
          Fahrzeug wechseln
        </button>
        {onReaktivieren ? (
          <button
            type="button"
            onClick={onReaktivieren}
            className="flex flex-1 items-center justify-center gap-2 rounded-m border px-3 py-2.5 text-sm font-semibold transition"
            style={{
              borderColor: "var(--amber-border)",
              background: "var(--amber-soft)",
              color: "var(--amber)",
            }}
          >
            <RotateCcw size={15} /> Reaktivieren (Funktionär)
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-text-3">
        Der Bericht ist nun bei „Florian Eberstalzell" sichtbar
      </p>

      {/* ─── Quick-Actions: was als Nächstes? ─────────────────────── */}
      {onNeuerBericht || onArchiv ? (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginBottom: 10,
              textAlign: "center",
            }}
          >
            Was als nächstes
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
            }}
          >
            {onNeuerBericht ? (
              <>
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
              </>
            ) : null}
            {onArchiv ? (
              <QuickActionCard
                Icon={Archive}
                label="Archiv"
                sub="letzte Berichte"
                color="var(--fg-2)"
                glow="0 10px 28px -8px rgba(15,23,42,0.32)"
                onClick={onArchiv}
              />
            ) : null}
          </div>
        </div>
      ) : null}
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
  Icon: typeof CheckCircle2;
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
        gap: 6,
        padding: "14px 14px 16px",
        borderRadius: "var(--radius-m)",
        border: "1px solid var(--glass-border)",
        background: "var(--glass-2)",
        backdropFilter: "var(--blur-2)",
        WebkitBackdropFilter: "var(--blur-2)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 180ms var(--ease-smooth)",
        color: "var(--fg)",
        minHeight: 88,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = glow;
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.borderColor = "var(--glass-border)";
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color,
          marginBottom: 2,
        }}
      >
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span style={{ fontSize: 17.5, fontWeight: 700, letterSpacing: "-0.011em" }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fg-3)",
        }}
      >
        {sub}
      </span>
    </button>
  );
}

function formatStamp(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
