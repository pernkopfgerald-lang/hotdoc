import { ClipboardList, Plus, X } from "lucide-react";
import { useState } from "react";

export interface Auftrag {
  id: string;
  text: string;
  zeitstempel: string;
}

interface Props {
  auftraege: Auftrag[];
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}

const QUICK_CHIPS = [
  "Verkehrsabsicherung",
  "Wassertransport",
  "Personenrettung",
  "Brandbekämpfung außen",
  "Brandbekämpfung innen",
  "Technische Hilfeleistung",
  "Atemschutz-Trupp",
  "Drehleiter-Einsatz",
  "Nachlöscharbeiten",
  "Beleuchtung sichern",
] as const;

/**
 * "Zusätzliche Aufträge" — alles was während des Einsatzes anfällt
 * und nicht in den festen Sektionen abgebildet ist. Freitext + Quick-Chips
 * für die häufigsten Aufgaben.
 */
export function AuftraegeSection({ auftraege, onAdd, onRemove }: Props) {
  const [input, setInput] = useState("");
  const placeholderShown = auftraege.length === 0;

  function submit() {
    const text = input.trim();
    if (!text) return;
    onAdd(text);
    setInput("");
  }

  return (
    <section
      className="rounded-m border p-3.5"
      style={{
        borderColor: "var(--border-strong)",
        background: "var(--card-gradient)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <header className="mb-2.5 flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-amber" />
          <h2 className="m-0 text-[16px] font-semibold tracking-tight text-text-1">
            Zusätzliche Aufträge
          </h2>
        </div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-text-3">
          {auftraege.length} Eintr{auftraege.length === 1 ? "ag" : "äge"}
        </span>
      </header>

      {/* Quick-Chips */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onAdd(chip)}
            className="rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium transition active:translate-y-px"
            style={{
              borderColor: "var(--border-strong)",
              background: "var(--surface-2)",
              color: "var(--text-2)",
            }}
          >
            + {chip}
          </button>
        ))}
      </div>

      {/* Freitext-Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Eigener Auftrag …"
          className="flex-1 rounded-s border px-3 py-2 text-[14px] text-text-1 outline-none transition placeholder:text-text-3 focus:border-amber-border"
          style={{ background: "var(--surface-2)", borderColor: "var(--border-strong)" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!input.trim()}
          className="grid h-10 w-10 place-items-center rounded-s text-white transition disabled:opacity-50"
          style={{
            background: "linear-gradient(180deg, var(--amber) 0%, color-mix(in srgb, var(--amber) 60%, #000) 100%)",
            border: "1px solid color-mix(in srgb, var(--amber) 60%, #000)",
            boxShadow: "0 6px 16px -6px var(--amber-glow)",
          }}
          aria-label="Auftrag hinzufügen"
        >
          <Plus size={18} strokeWidth={2.6} />
        </button>
      </div>

      {/* Liste */}
      {placeholderShown ? (
        <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-text-3">
          Noch keine Aufträge — chip antippen oder Text eingeben
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {auftraege.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-s border px-3 py-2 transition"
              style={{
                borderColor: "var(--amber-border)",
                background: "var(--amber-soft)",
              }}
            >
              <span
                className="font-mono text-[10px] font-semibold tabular-nums tracking-wide text-amber"
              >
                {formatTime(a.zeitstempel)}
              </span>
              <span className="flex-1 text-[14px] font-medium text-text-1">{a.text}</span>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label="Auftrag entfernen"
                className="grid h-7 w-7 place-items-center rounded-full border text-text-3 transition hover:border-red-border hover:text-red"
                style={{ borderColor: "var(--border-strong)", background: "var(--surface-2)" }}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "—";
  }
}
function pad(n: number): string {
  return String(n).padStart(2, "0");
}
