import { useState } from "react";

export interface GearItem {
  id: string;
  bezeichnung: string;
  isOelbindemittel?: boolean;
}

interface Props {
  items: GearItem[];
  selected: ReadonlySet<string>;
  oelbindemittelSaecke: number;
  onToggle: (id: string) => void;
  onOelChange: (newCount: number) => void;
}

export function GearChips({ items, selected, oelbindemittelSaecke, onToggle, onOelChange }: Props) {
  const oelOn = oelbindemittelSaecke > 0;
  const count = selected.size + (oelOn ? 1 : 0);

  return (
    <section className="rounded-m border border-border bg-surface-1 p-3.5">
      <header className="mb-2.5 flex items-baseline justify-between">
        <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">
          Geräte &amp; Mittel
        </h2>
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-text-3">
          {count} ausgewählt
        </span>
      </header>

      <ul className="flex flex-wrap gap-1.5">
        {items.map((it) =>
          it.isOelbindemittel ? (
            <li key={it.id}>
              <OelSmartChip aktiv={oelOn} saecke={oelbindemittelSaecke} onChange={onOelChange} />
            </li>
          ) : (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onToggle(it.id)}
                className={`rounded-full border px-3 py-2 text-[13px] font-medium transition ${
                  selected.has(it.id)
                    ? "border-emerald/40 bg-emerald/10 font-semibold text-emerald"
                    : "border-border bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text-1"
                }`}
              >
                {selected.has(it.id) ? (
                  <span
                    className="mr-1.5 inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-emerald"
                    style={{ boxShadow: "0 0 6px var(--emerald-glow)" }}
                  />
                ) : null}
                {it.bezeichnung}
              </button>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function OelSmartChip({
  aktiv,
  saecke,
  onChange,
}: {
  aktiv: boolean;
  saecke: number;
  onChange: (n: number) => void;
}) {
  const [internal, setInternal] = useState(saecke || 1);

  function toggleActive() {
    if (aktiv) onChange(0);
    else onChange(internal > 0 ? internal : 1);
  }
  function step(delta: number) {
    const next = Math.max(1, Math.min(99, saecke + delta));
    setInternal(next);
    onChange(next);
  }

  return (
    <div
      aria-pressed={aktiv}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] transition ${
        aktiv
          ? "border-amber/45 bg-amber/15 font-semibold text-amber"
          : "border-border bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text-1"
      }`}
    >
      <button
        type="button"
        onClick={toggleActive}
        className="flex items-center gap-2"
      >
        {aktiv ? (
          <span
            className="inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-amber"
            style={{ boxShadow: "0 0 6px var(--amber-soft)" }}
          />
        ) : null}
        Ölbindemittel
      </button>

      {aktiv ? (
        <span className="flex items-center gap-1.5 border-l border-amber/35 pl-2.5">
          <button
            type="button"
            aria-label="Minus 1 Sack"
            onClick={() => step(-1)}
            className="grid h-6 w-6 place-items-center rounded border border-amber/40 bg-surface-1 font-mono text-sm font-bold text-amber transition hover:bg-surface-3"
          >
            −
          </button>
          <span className="min-w-[18px] text-center font-condensed text-base font-bold tabular-nums text-text-1">
            {saecke}
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-amber">
            Säcke
          </span>
          <button
            type="button"
            aria-label="Plus 1 Sack"
            onClick={() => step(1)}
            className="grid h-6 w-6 place-items-center rounded border border-amber/40 bg-surface-1 font-mono text-sm font-bold text-amber transition hover:bg-surface-3"
          >
            +
          </button>
        </span>
      ) : null}

      {aktiv ? (
        <span className="rounded border border-amber/40 bg-amber/15 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.05em] text-amber">
          €
        </span>
      ) : null}
    </div>
  );
}
