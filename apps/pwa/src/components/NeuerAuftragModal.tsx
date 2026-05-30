import { MapPin, Plus, X } from "lucide-react";
import { useState } from "react";

interface Props {
  open: boolean;
  /** Personen die aus dem aktuellen Auftrag übernommen werden — nur Anzeige */
  inheritedCount: number;
  onConfirm: (einsatzart: string, einsatzort: string) => void;
  onCancel: () => void;
}

const QUICK_EINSATZARTEN = [
  "Folgeeinsatz",
  "Brand KFZ",
  "Brand Gebäude",
  "Technische Hilfeleistung",
  "Verkehrsunfall",
  "Auslaufende Betriebsmittel",
  "Sturmschaden",
  "Hochwassereinsatz",
] as const;

/**
 * Modal zum Anlegen eines weiteren parallelen Auftrags.
 * Übernimmt Personal aus dem aktuellen Auftrag — nur Einsatzart und
 * Einsatzort müssen vom Bediener gewählt werden.
 */
export function NeuerAuftragModal({ open, inheritedCount, onConfirm, onCancel }: Props) {
  const [einsatzart, setEinsatzart] = useState<string>("Folgeeinsatz");
  const [einsatzort, setEinsatzort] = useState<string>("");

  if (!open) return null;

  const canSubmit = einsatzart.trim() && einsatzort.trim();

  return (
    <div
      className="fixed inset-0 z-[2000] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[18px]"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          boxShadow: "0 30px 80px -30px rgba(15, 23, 42, 0.5)",
        }}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-9 w-9 place-items-center rounded-[12px]"
              style={{ background: "var(--info-tint)", color: "var(--info)" }}
            >
              <Plus size={16} strokeWidth={2.4} />
            </span>
            <div className="flex flex-col leading-tight">
              <h2 className="text-[18px] font-bold tracking-tight" style={{ color: "var(--fg)" }}>
                Neuer Auftrag
              </h2>
              <span
                className="font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
                style={{ color: "var(--fg-3)" }}
              >
                {inheritedCount} Personen übernommen
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Schließen"
            className="grid h-9 w-9 place-items-center rounded-[12px] border transition"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface-2)",
              color: "var(--fg-2)",
            }}
          >
            <X size={16} />
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label
              className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ color: "var(--fg-3)" }}
            >
              Einsatzart
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_EINSATZARTEN.map((art) => (
                <button
                  key={art}
                  type="button"
                  onClick={() => setEinsatzart(art)}
                  className="rounded-full border px-3 py-1.5 text-[13px] font-semibold transition"
                  style={
                    art === einsatzart
                      ? {
                          background: "var(--info-tint)",
                          color: "var(--info)",
                          borderColor: "rgba(37, 99, 235, 0.30)",
                        }
                      : {
                          background: "var(--surface-2)",
                          color: "var(--fg-2)",
                          borderColor: "transparent",
                        }
                  }
                >
                  {art}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={einsatzart}
              onChange={(e) => setEinsatzart(e.target.value)}
              placeholder="Oder eigene Einsatzart …"
              className="mt-1 w-full rounded-[12px] border-[1.5px] px-3.5 py-2.5 text-[15px] outline-none transition"
              style={{
                background: "var(--surface-2)",
                borderColor: "transparent",
                color: "var(--fg)",
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ color: "var(--fg-3)" }}
            >
              Einsatzadresse
            </label>
            <div
              className="flex items-center gap-2 rounded-[12px] border-[1.5px] px-3.5 py-2 transition"
              style={{
                background: einsatzort ? "var(--surface)" : "var(--surface-2)",
                borderColor: einsatzort ? "var(--border)" : "transparent",
              }}
            >
              <MapPin size={16} style={{ color: "var(--fg-3)" }} />
              <input
                type="text"
                value={einsatzort}
                onChange={(e) => setEinsatzort(e.target.value)}
                placeholder="z. B. Hauptstraße 12, 4653 Eberstalzell"
                className="flex-1 bg-transparent text-[15px] font-medium outline-none"
                style={{ color: "var(--fg)" }}
                autoFocus
              />
            </div>
            <p
              className="font-mono text-[10px] font-medium uppercase tracking-[0.08em]"
              style={{ color: "var(--fg-3)" }}
            >
              Adresse wird beim Abschluss für Strecken-Berechnung verwendet
            </p>
          </div>
        </div>

        {/* CTAs */}
        <footer
          className="flex gap-2 border-t px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[14px] border-[1.5px] px-4 py-2.5 text-[14px] font-semibold transition"
            style={{
              borderColor: "var(--border)",
              background: "var(--surface)",
              color: "var(--fg-2)",
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => canSubmit && onConfirm(einsatzart.trim(), einsatzort.trim())}
            disabled={!canSubmit}
            className="flex-1 rounded-[14px] px-4 py-2.5 text-[14px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: "var(--fg)",
              color: "var(--bg)",
            }}
          >
            Auftrag anlegen
          </button>
        </footer>
      </div>
    </div>
  );
}
