import { AlertTriangle, ArrowLeftRight, Radio, X } from "lucide-react";
import { useState } from "react";
import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";

interface Props {
  open: boolean;
  current: FahrzeugId;
  onSelect: (id: FahrzeugId) => void;
  onClose: () => void;
}

/**
 * Erlaubt das Umschalten auf ein anderes Fahrzeug ohne Setup-Reset.
 * Persistiert die Auswahl in PouchDB (fahrzeug:self-Doc) und lädt
 * die Seite neu, damit alle Komponenten den neuen Funkrufnamen sehen.
 *
 * RISIKO-2 (Audit 2026-06-03): Der Wechsel ist zweistufig. Früher löste ein
 * Tap auf ein Fahrzeug SOFORT den Wechsel aus (Page-Reload) und verwarf die
 * laufende Erfassung — die Warnung stand nur als 10px-Graustufentext unter
 * den Buttons, die ein gestresster Funktionär nicht liest. Jetzt: Tap →
 * expliziter Bestätigungs-Screen mit großem rotem "Wechseln"-Button.
 */
export function VehicleSwitcherModal({ open, current, onSelect, onClose }: Props) {
  const [pendingId, setPendingId] = useState<FahrzeugId | null>(null);
  if (!open) return null;

  function handleClose(): void {
    setPendingId(null);
    onClose();
  }

  // ─── Stufe 2: Bestätigung ───
  if (pendingId) {
    const ziel = FAHRZEUGE[pendingId];
    return (
      <div
        className="fixed inset-0 z-[2000] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
        onPointerDown={(e) => {
          // Backdrop-Klick bricht NUR die Bestätigung ab (zurück zur Liste),
          // verwirft aber nichts — kein versehentlicher Wechsel.
          if (e.target === e.currentTarget) setPendingId(null);
        }}
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-l border"
          style={{
            borderColor: "var(--red-border)",
            background: "var(--card-gradient)",
            boxShadow: "0 30px 80px -30px var(--red-glow), var(--shadow-card)",
          }}
        >
          <div className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2.5">
              <span
                className="grid h-10 w-10 place-items-center rounded-md text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--red) 0%, var(--red-strong) 100%)",
                }}
              >
                <AlertTriangle size={18} />
              </span>
              <h2 className="font-condensed text-[18px] font-bold tracking-tight text-text-1">
                Auf {ziel.funkrufname} wechseln?
              </h2>
            </div>
            <p className="text-[14px] leading-relaxed text-text-2">
              Die <strong>laufende Erfassung dieses Tablets</strong> (Mannschaft,
              Geräte, Aufträge) wird verworfen, soweit sie noch nicht an Florian
              übermittelt wurde. Wirklich wechseln?
            </p>
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setPendingId(null)}
                className="flex-1 rounded-m border px-3 py-3 text-sm font-semibold text-text-1"
                style={{ borderColor: "var(--border-strong)", background: "var(--surface-2)", minHeight: 48 }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => onSelect(pendingId)}
                className="flex flex-1 items-center justify-center gap-2 rounded-m px-3 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white"
                style={{
                  background: "linear-gradient(180deg, var(--red) 0%, var(--red-strong) 100%)",
                  border: "1px solid color-mix(in srgb, var(--red-strong) 60%, #000)",
                  minHeight: 48,
                }}
              >
                <ArrowLeftRight size={16} /> Wechseln
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Stufe 1: Fahrzeug-Auswahl ───
  return (
    <div
      className="fixed inset-0 z-[2000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-l border"
        style={{
          borderColor: "var(--border-strong)",
          background: "var(--card-gradient)",
          boxShadow: "0 30px 80px -30px var(--red-glow), var(--shadow-card)",
        }}
      >
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: "var(--border-strong)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-8 w-8 place-items-center rounded-md"
              style={{
                background: "var(--amber-soft)",
                border: "1px solid var(--amber-border)",
                color: "var(--amber)",
              }}
            >
              <Radio size={14} />
            </span>
            <div className="flex flex-col leading-tight">
              <h2 className="font-condensed text-[17px] font-bold tracking-tight text-text-1">
                Fahrzeug wechseln
              </h2>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-3">
                aktiver Funkrufname · {FAHRZEUGE[current].funkrufname}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface-2 text-text-2 transition hover:border-border-strong hover:text-text-1"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </header>

        <ul className="flex flex-col gap-1.5 p-3">
          {FAHRZEUG_IDS.map((id) => {
            const f = FAHRZEUGE[id];
            const active = id === current;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setPendingId(id)}
                  disabled={active}
                  className="flex w-full items-center gap-3 rounded-m border px-3.5 py-2.5 text-left transition disabled:cursor-default"
                  style={{
                    borderColor: active ? "var(--amber-border)" : "var(--border-strong)",
                    background: active
                      ? "color-mix(in srgb, var(--amber-soft) 60%, var(--surface-2))"
                      : "var(--surface-2)",
                    boxShadow: active
                      ? "0 0 0 1px var(--amber-border), 0 0 18px -6px var(--amber-glow)"
                      : undefined,
                  }}
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-md font-mono text-[11px] font-bold uppercase tracking-wider"
                    style={{
                      background: active ? "var(--amber-soft)" : "var(--surface-3)",
                      color: active ? "var(--amber)" : "var(--text-2)",
                      border: `1px solid ${active ? "var(--amber-border)" : "var(--border)"}`,
                    }}
                  >
                    {idToAbk(id)}
                  </span>
                  <div className="flex flex-1 flex-col leading-tight">
                    <span className="font-condensed text-[15px] font-bold tracking-tight text-text-1">
                      {f.funkrufname}
                    </span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
                      {f.bezeichnung} · Besatzung {f.besatzung.typ}
                    </span>
                  </div>
                  {active ? (
                    <span
                      className="rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em]"
                      style={{
                        borderColor: "var(--amber-border)",
                        background: "var(--amber-soft)",
                        color: "var(--amber)",
                      }}
                    >
                      Aktiv
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <footer
          className="border-t px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-3"
          style={{ borderColor: "var(--border)" }}
        >
          Hinweis · Wechsel verwirft die laufende Erfassung dieses Tablets.
        </footer>
      </div>
    </div>
  );
}

function idToAbk(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "KDO";
    case "tlf-a-4000": return "TANK";
    case "lfa-b":      return "LFA-B";
    case "mtf":        return "MTF";
    case "zentrale":   return "FL";
  }
}
