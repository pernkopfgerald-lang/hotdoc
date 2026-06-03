import { ClipboardList, X } from "lucide-react";
import { useState } from "react";

export interface Auftrag {
  id: string;
  text: string;
  zeitstempel: string;
}

interface Props {
  auftraege: Auftrag[];
  verfuegbareTypen: readonly string[];
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}

/**
 * AuftraegeSection — Design `.card` mit `.chips`/`.chip.task` (selected =
 * blau-tint statt grün). Freitext-Input + großer Add-Button als `.freeform`.
 */
export function AuftraegeSection({ auftraege, verfuegbareTypen, onAdd, onRemove }: Props) {
  const [input, setInput] = useState("");

  function submit() {
    const text = input.trim();
    if (!text) return;
    onAdd(text);
    setInput("");
  }

  /** Custom-Aufträge: alle, die NICHT in verfuegbareTypen sind */
  const customs = auftraege.filter((a) => !verfuegbareTypen.includes(a.text));

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <ClipboardList size={20} />
          Auftrag
        </div>
        <span className="card-meta">
          <span className="num">{auftraege.length}</span>{" "}
          {auftraege.length === 1 ? "Eintrag" : "Einträge"}
        </span>
      </div>

      <div className="chips">
        {verfuegbareTypen.map((typ) => {
          const match = auftraege.find((a) => a.text === typ);
          const selected = !!match;
          return (
            <button
              key={typ}
              type="button"
              onClick={() => (selected && match ? onRemove(match.id) : onAdd(typ))}
              className={`chip task${selected ? " selected" : ""}`}
            >
              {selected ? <span className="dot" /> : <span className="plus">+</span>}
              {typ}
            </button>
          );
        })}

        {/* Customs als entfernbare Pills */}
        {customs.map((a) => (
          <span key={a.id} className="chip task selected" style={{ gap: 8 }}>
            <span className="dot" />
            {a.text}
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              aria-label="Auftrag entfernen"
              style={{
                background: "transparent",
                border: 0,
                color: "inherit",
                cursor: "pointer",
                padding: 0,
                marginLeft: 4,
                marginRight: -4,
                display: "inline-flex",
                minHeight: 0,
              }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>

      <div className="freeform">
        {/* Issue 5 (Einsatz-Test 2026-06-02): Browser-Spellcheck mit
            de-AT damit das Tablet "Verkehrsabsicherung" usw. korrekt
            erkennt und Tippfehler markiert. */}
        <input
          type="text"
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Eigener Auftrag …"
          spellCheck
          lang="de-AT"
        />
        <button
          type="button"
          className="add-btn"
          onClick={submit}
          disabled={!input.trim()}
          aria-label="Hinzufügen"
        >
          +
        </button>
      </div>
    </section>
  );
}
