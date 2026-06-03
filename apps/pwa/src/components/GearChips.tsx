import { Box, Minus, Plus } from "lucide-react";
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

/**
 * GearChips — Design `.card` mit `.card-head`/`.card-title`/`.card-meta` und
 * den `.chips`/`.chip.selected`-Pills aus design.css.
 */
export function GearChips({ items, selected, oelbindemittelSaecke, onToggle, onOelChange }: Props) {
  const oelOn = oelbindemittelSaecke > 0;
  const count = selected.size + (oelOn ? 1 : 0);

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <Box size={20} />
          Geräte &amp; Mittel
        </div>
        <span className="card-meta">
          <span className="num">{count}</span> ausgewählt
        </span>
      </div>

      <div className="chips">
        {items.map((it) =>
          it.isOelbindemittel ? (
            <OelSmartChip
              key={it.id}
              aktiv={oelOn}
              saecke={oelbindemittelSaecke}
              onChange={onOelChange}
            />
          ) : (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`chip${selected.has(it.id) ? " selected" : ""}`}
            >
              {selected.has(it.id) ? (
                <span className="dot" />
              ) : (
                <span className="plus">+</span>
              )}
              {it.bezeichnung}
            </button>
          ),
        )}
      </div>
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

  if (!aktiv) {
    return (
      <button type="button" onClick={toggleActive} className="chip">
        <span className="plus">+</span>
        Ölbindemittel
      </button>
    );
  }

  return (
    <span
      className="chip selected"
      style={{
        background: "var(--warn-tint)",
        color: "var(--warn)",
        borderColor: "rgba(217,119,6,0.30)",
        paddingRight: 6,
      }}
    >
      <button
        type="button"
        onClick={toggleActive}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          color: "inherit",
          font: "inherit",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minHeight: 0,
        }}
      >
        <span className="dot" style={{ background: "var(--warn)" }} />
        Ölbindemittel
      </button>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginLeft: 8,
          paddingLeft: 8,
          borderLeft: "1px solid rgba(217,119,6,0.30)",
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Minus 1 Sack"
          style={{
            width: 22,
            height: 22,
            minHeight: 22,
            border: "1px solid rgba(217,119,6,0.35)",
            background: "var(--surface)",
            borderRadius: 6,
            color: "var(--warn)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Minus size={11} strokeWidth={3} />
        </button>
        <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700, color: "var(--fg)" }}>
          {saecke}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.06em" }}>Säcke</span>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Plus 1 Sack"
          style={{
            width: 22,
            height: 22,
            minHeight: 22,
            border: "1px solid rgba(217,119,6,0.35)",
            background: "var(--surface)",
            borderRadius: 6,
            color: "var(--warn)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Plus size={11} strokeWidth={3} />
        </button>
      </span>
    </span>
  );
}
