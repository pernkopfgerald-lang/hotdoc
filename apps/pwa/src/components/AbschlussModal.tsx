import { AlertTriangle, CheckCircle2, Lock, X } from "lucide-react";

export interface AbschlussCheck {
  ok: boolean;
  /** Pflichtwarnung (rot) wenn nicht ok */
  label: string;
}

interface Props {
  open: boolean;
  funkrufname: string;
  checks: AbschlussCheck[];
  /** Statistik-Zeile unten — z. B. Dauer, KM, Personen */
  summary: { label: string; value: string }[];
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Vor dem endgültigen Abschluss zeigen wir noch einmal Sanity-Checks
 * (Fahrer/Kdt eingetragen, Mannschaft mindestens 1 Person, etc.) plus
 * eine Zusammenfassung. Erst die explizite Confirm-Aktion lockt den
 * Bericht und übergibt ihn an die Zentrale (Florian Eberstalzell).
 */
export function AbschlussModal({ open, funkrufname, checks, summary, onConfirm, onCancel }: Props) {
  if (!open) return null;
  const offene = checks.filter((c) => !c.ok);
  const canConfirm = offene.length === 0;

  return (
    <div
      className="fixed inset-0 z-[2000] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-l border"
        style={{
          borderColor: canConfirm ? "var(--red-border)" : "var(--amber-border)",
          background: "var(--card-gradient)",
          boxShadow: canConfirm
            ? "0 30px 80px -30px var(--red-glow), var(--shadow-card)"
            : "0 30px 80px -30px var(--amber-glow), var(--shadow-card)",
        }}
      >
        {/* Beacon-Balken passend zum Status */}
        <div
          aria-hidden
          className="h-[3px] w-full"
          style={{
            background: canConfirm
              ? "linear-gradient(90deg, transparent 0%, var(--red) 18%, var(--red) 82%, transparent 100%)"
              : "linear-gradient(90deg, transparent 0%, var(--amber) 18%, var(--amber) 82%, transparent 100%)",
            animation: "beacon 2.4s ease-in-out infinite",
          }}
        />

        <header className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-strong)" }}>
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-9 w-9 place-items-center rounded-md text-white"
              style={{
                background: canConfirm
                  ? "linear-gradient(135deg, var(--red) 0%, var(--red-strong) 100%)"
                  : "linear-gradient(135deg, var(--amber) 0%, color-mix(in srgb, var(--amber) 60%, #000) 100%)",
                boxShadow: canConfirm
                  ? "0 0 18px -2px var(--red-glow)"
                  : "0 0 18px -2px var(--amber-glow)",
              }}
            >
              {canConfirm ? <Lock size={16} /> : <AlertTriangle size={16} />}
            </span>
            <div className="flex flex-col leading-tight">
              <h2 className="font-condensed text-[18px] font-bold tracking-tight text-text-1">
                Bericht abschließen
              </h2>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-3">
                {funkrufname} · {canConfirm ? "alle Pflichtfelder erfüllt" : `${offene.length} offen · trotzdem schließen?`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Schließen"
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-text-2 transition hover:text-text-1"
          >
            <X size={16} />
          </button>
        </header>

        {/* Pflicht-Checks */}
        <ul className="flex flex-col gap-1.5 p-3">
          {checks.map((c, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 rounded-s border px-3 py-2"
              style={{
                borderColor: c.ok ? "var(--emerald-border)" : "var(--amber-border)",
                background: c.ok ? "var(--emerald-bg)" : "var(--amber-soft)",
              }}
            >
              {c.ok ? (
                <CheckCircle2 size={15} className="shrink-0 text-emerald" />
              ) : (
                <AlertTriangle size={15} className="shrink-0 text-amber" />
              )}
              <span
                className="flex-1 text-[13px] font-medium"
                style={{ color: c.ok ? "var(--emerald)" : "var(--amber)" }}
              >
                {c.label}
              </span>
            </li>
          ))}
        </ul>

        {/* Summary */}
        <div
          className="grid grid-cols-2 gap-px overflow-hidden border-y"
          style={{ borderColor: "var(--border)" }}
        >
          {summary.map((s, i) => (
            <div
              key={i}
              className="px-3 py-2"
              style={{
                background: "color-mix(in srgb, var(--surface-2) 60%, transparent)",
                borderLeft: i % 2 === 1 ? "1px solid var(--border)" : undefined,
                borderTop: i >= 2 ? "1px solid var(--border)" : undefined,
              }}
            >
              <dt className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
                {s.label}
              </dt>
              <dd className="m-0 mt-0.5 text-[14px] font-bold tabular-nums text-text-1">{s.value}</dd>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <footer className="flex gap-2 p-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-m border px-3 py-2.5 text-sm font-semibold text-text-2 transition hover:text-text-1"
            style={{ borderColor: "var(--border-strong)", background: "var(--surface-2)" }}
          >
            Zurück bearbeiten
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-m px-3 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white transition active:translate-y-px"
            style={{
              background: canConfirm
                ? "linear-gradient(180deg, var(--red) 0%, var(--red-strong) 100%)"
                : "linear-gradient(180deg, var(--amber) 0%, color-mix(in srgb, var(--amber) 60%, #000) 100%)",
              border: `1px solid color-mix(in srgb, ${
                canConfirm ? "var(--red-strong)" : "var(--amber)"
              } 60%, #000)`,
              boxShadow: canConfirm
                ? "0 10px 24px -8px var(--red-glow), inset 0 1px 0 rgba(255,255,255,0.2)"
                : "0 10px 24px -8px var(--amber-glow), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
          >
            {canConfirm ? "Abschließen & übergeben" : "Trotzdem schließen"}
          </button>
        </footer>
      </div>
    </div>
  );
}
