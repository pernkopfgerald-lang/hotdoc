import { Radio, X } from "lucide-react";
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
 */
export function VehicleSwitcherModal({ open, current, onSelect, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[2000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-l border"
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
            onClick={onClose}
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
                  onClick={() => onSelect(id)}
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
