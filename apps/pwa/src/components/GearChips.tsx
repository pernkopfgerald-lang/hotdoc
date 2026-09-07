import { Box, ChevronDown, ChevronUp, Minus, Plus, X } from "lucide-react";
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
  /**
   * Review 2026-09-06: IDs der meistgenutzten Geräte (aus den letzten 40
   * Berichten dieses Fahrzeugs, siehe lib/geraete-recent.ts), häufigste
   * zuerst. Nur diese + bereits ausgewählte stehen standardmäßig offen;
   * der Rest sitzt hinter "weitere Geräte". Leer/zu kurz → keine Kürzung,
   * es werden einfach alle Katalog-Items gezeigt (z. B. frisches Tablet
   * ohne Verlauf, oder Fahrzeug mit ≤6 Geräten).
   */
  topIds?: string[];
  /** Freitext-Gerät hinzufügen — Text landet 1:1 als materialId (Backend
   *  erlaubt beliebige Strings, siehe GeraetUseageSchema). */
  onAddCustom: (text: string) => void;
}

const MIN_SICHTBAR = 6;

/**
 * GearChips — Design `.card` mit `.card-head`/`.card-title`/`.card-meta` und
 * den `.chips`/`.chip.selected`-Pills aus design.css.
 */
export function GearChips({
  items,
  selected,
  oelbindemittelSaecke,
  onToggle,
  onOelChange,
  topIds = [],
  onAddCustom,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [freitext, setFreitext] = useState("");
  const oelOn = oelbindemittelSaecke > 0;
  const count = selected.size + (oelOn ? 1 : 0);

  // Ölbindemittel hat einen eigenen Smart-Chip mit Stepper — läuft nie durch
  // die Haeufig/Weitere-Kuerzung, steht immer zuerst wie bisher.
  const plainItems = items.filter((it) => !it.isOelbindemittel);
  const oelItem = items.find((it) => it.isOelbindemittel);

  // Review 2026-09-06: "Häufig" = topIds-Reihenfolge + alles bereits
  // Ausgewaehlte (eine getroffene Auswahl darf beim Kollabieren nie aus dem
  // Blick verschwinden). Reicht die Katalogliste (≤ MIN_SICHTBAR) oder gibt
  // es noch keinen Haeufigkeits-Verlauf, wird gar nicht gekuerzt.
  const topIdSet = new Set(topIds);
  const sichtbarIds = new Set<string>([
    ...topIds.slice(0, MIN_SICHTBAR),
    ...[...selected].filter((id) => plainItems.some((it) => it.id === id)),
  ]);
  const kuerzungAktiv = topIds.length > 0 && plainItems.length > sichtbarIds.size;
  const hauptListe = kuerzungAktiv
    ? plainItems
        .filter((it) => sichtbarIds.has(it.id))
        .sort((a, b) => topIds.indexOf(a.id) - topIds.indexOf(b.id) || (topIdSet.has(a.id) ? -1 : 1))
    : plainItems;
  const weitereListe = kuerzungAktiv ? plainItems.filter((it) => !sichtbarIds.has(it.id)) : [];

  // Freitext-Geraete: ausgewaehlte IDs, die zu KEINEM Katalog-Item passen —
  // gleiches Muster wie AuftraegeSection.customs.
  const customGear = [...selected].filter((id) => !items.some((it) => it.id === id));

  function submitFreitext() {
    const text = freitext.trim();
    if (!text) return;
    onAddCustom(text);
    setFreitext("");
  }

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
        {oelItem ? (
          <OelSmartChip aktiv={oelOn} saecke={oelbindemittelSaecke} onChange={onOelChange} />
        ) : null}
        {hauptListe.map((it) => (
          <GearChip key={it.id} item={it} selected={selected.has(it.id)} onToggle={onToggle} />
        ))}
        {expanded && weitereListe.map((it) => (
          <GearChip key={it.id} item={it} selected={selected.has(it.id)} onToggle={onToggle} />
        ))}
        {customGear.map((id) => (
          <span key={id} className="chip selected" style={{ gap: 8 }}>
            <span className="dot" />
            {id}
            <button
              type="button"
              onClick={() => onToggle(id)}
              aria-label="Gerät entfernen"
              style={{
                background: "transparent",
                border: 0,
                color: "inherit",
                cursor: "pointer",
                padding: 8,
                marginLeft: 4,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 44,
                minHeight: 44,
              }}
            >
              <X size={15} />
            </button>
          </span>
        ))}
      </div>

      {kuerzungAktiv && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="themetoggle"
          style={{ marginTop: 8, width: "auto", padding: "8px 14px", gap: 6, fontSize: 14.5 }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {expanded ? "Weniger anzeigen" : `${weitereListe.length} weitere Geräte`}
        </button>
      )}

      <div className="freeform" style={{ marginTop: 10 }}>
        <input
          type="text"
          className="input"
          value={freitext}
          onChange={(e) => setFreitext(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitFreitext()}
          placeholder="Eigenes Gerät / Mittel …"
          spellCheck
          lang="de-AT"
        />
        <button
          type="button"
          className="add-btn"
          onClick={submitFreitext}
          disabled={!freitext.trim()}
          aria-label="Gerät hinzufügen"
        >
          +
        </button>
      </div>
    </section>
  );
}

function GearChip({
  item,
  selected,
  onToggle,
}: {
  item: GearItem;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(item.id)}
      className={`chip${selected ? " selected" : ""}`}
      /* T-06 (Audit 2026-07): 44px Touch-Target per Inline-Override —
         die .chip-Klasse NICHT anfassen (andere Konsumenten, z. B.
         kompakte Pillen im NeuerEinsatzTabletModal). */
      style={{ minHeight: 44 }}
    >
      {selected ? <span className="dot" /> : <span className="plus">+</span>}
      {item.bezeichnung}
    </button>
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
      /* T-06 (Audit 2026-07): 44px Touch-Target, siehe Chip-Liste oben. */
      <button type="button" onClick={toggleActive} className="chip" style={{ minHeight: 44 }}>
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
      {/* KDT-08 (Audit 2026-06-12): Stepper-Buttons von 22x22 auf 44x44 —
          mit Einsatzhandschuh treffbar (Muster: stepBtnStyle im AsTimer von
          MannschaftSlot.tsx). Abstand zum Aktivieren-Toggle >=12px, damit
          ein Fehltap nicht das ganze Ölbindemittel deaktiviert. */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginLeft: 12,
          paddingLeft: 12,
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
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            border: "1px solid rgba(217,119,6,0.35)",
            background: "var(--surface)",
            borderRadius: 6,
            color: "var(--warn)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Minus size={15} strokeWidth={3} />
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
            width: 44,
            height: 44,
            minWidth: 44,
            minHeight: 44,
            border: "1px solid rgba(217,119,6,0.35)",
            background: "var(--surface)",
            borderRadius: 6,
            color: "var(--warn)",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Plus size={15} strokeWidth={3} />
        </button>
      </span>
    </span>
  );
}
