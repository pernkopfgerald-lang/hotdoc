import { AlertTriangle, CheckCircle2, Loader2, Lock, RotateCcw, UploadCloud } from "lucide-react";

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
    | { kind: "error"; msg: string };
  /** Manueller Retry für den Upload (nur sichtbar wenn syncState=error). */
  onRetryUpload?: () => void;
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
                  : "var(--border-strong)",
            background:
              syncState.kind === "ok"
                ? "var(--ok-tint)"
                : syncState.kind === "error"
                  ? "var(--red-tint)"
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
    </div>
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
