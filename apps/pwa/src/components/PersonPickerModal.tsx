import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export interface PickPerson {
  _id: string;
  syBosId: number;
  nachname: string;
  vorname: string;
  dienstgrad: string;
  atemschutzGueltig: boolean;
}

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  personen: PickPerson[];
  /** IDs bereits gewählter Personen (für Doppelauswahl-Schutz). */
  bereitsGewaehlt: ReadonlySet<number>;
  onSelect: (p: PickPerson) => void;
  onClose: () => void;
}

export function PersonPickerModal({
  open,
  title,
  subtitle,
  personen,
  bereitsGewaehlt,
  onSelect,
  onClose,
}: Props) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const norm = q.trim().toLowerCase();
    if (!norm) return personen;
    return personen.filter(
      (p) =>
        `${p.nachname} ${p.vorname}`.toLowerCase().includes(norm) ||
        p.dienstgrad.toLowerCase().includes(norm),
    );
  }, [q, personen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center md:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-title"
      // Click-Events innerhalb dieses Modals duerfen NICHT zum Parent
      // bubblen — sonst schliesst der Backdrop-Click-Handler des Parent-
      // Modals (z.B. NeuerEinsatzTabletModal) versehentlich das ganze
      // Modal mit, wenn der User auf eine Person klickt. User-Bug-Report:
      // "wenn ich Übung anlegen und dann einen Übungsleiter auswähle,
      // dann schließt er die Maske".
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Schließen"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-2xl border border-border bg-surface-1 shadow-2xl md:rounded-2xl">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h3 id="picker-title" className="text-base font-semibold text-text-1">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-text-3">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-text-2 transition hover:bg-surface-3 hover:text-text-1"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
          <Search size={16} className="text-text-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name suchen …"
            autoFocus
            className="flex-1 bg-transparent text-[16px] text-text-1 outline-none placeholder:text-text-3"
          />
          <span className="whitespace-nowrap font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
            {filtered.length} Treffer
          </span>
        </div>

        <ul className="m-0 list-none overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-text-3">Keine Person gefunden.</li>
          ) : (
            filtered.map((p) => {
              const gewaehlt = bereitsGewaehlt.has(p.syBosId);
              return (
                <li key={p._id}>
                  <button
                    type="button"
                    disabled={gewaehlt}
                    onClick={() => onSelect(p)}
                    className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="flex-1 text-[15px] font-medium text-text-1">
                      {p.nachname} {p.vorname}
                    </span>
                    {p.atemschutzGueltig ? (
                      <span className="rounded border border-amber/40 bg-amber/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.10em] text-amber">
                        AS
                      </span>
                    ) : (
                      <span className="rounded border border-border bg-transparent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.10em] text-text-3 opacity-50">
                        AS
                      </span>
                    )}
                    <span className="rounded border border-blue/25 bg-blue/10 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.10em] text-blue">
                      {p.dienstgrad}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
