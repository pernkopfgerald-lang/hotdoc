import { ClipboardList, Plus, X } from "lucide-react";
import { useState } from "react";

export interface Auftrag {
  id: string;
  text: string;
  zeitstempel: string;
}

interface Props {
  auftraege: Auftrag[];
  /** Verfügbare Schnellauswahl — wird in Phase 2 aus der Einsatzzentrale-Verwaltung gespeist */
  verfuegbareTypen: readonly string[];
  onAdd: (text: string) => void;
  onRemove: (id: string) => void;
}

/**
 * Auftrag — was im Rahmen dieses Einsatzes konkret zu tun ist.
 * Schnellauswahl-Chips kommen aus der globalen Auftrag-Typen-Konfiguration
 * (in der Einsatzzentrale verwaltbar — Phase 2). Aktuell als Default-
 * Konstante; das Backend liefert die Liste dann via /api/config/auftrag-typen.
 */
export function AuftraegeSection({ auftraege, verfuegbareTypen, onAdd, onRemove }: Props) {
  const [input, setInput] = useState("");
  const empty = auftraege.length === 0;

  function submit() {
    const text = input.trim();
    if (!text) return;
    onAdd(text);
    setInput("");
  }

  return (
    <section
      className="p-5"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <header className="mb-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardList size={20} style={{ color: "var(--fg-2)" }} />
          <h2
            className="text-[17px] font-bold tracking-tight"
            style={{ color: "var(--fg)" }}
          >
            Auftrag
          </h2>
        </div>
        <span
          className="font-mono text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--fg-3)" }}
        >
          <span style={{ color: "var(--fg)" }}>{auftraege.length}</span>{" "}
          {auftraege.length === 1 ? "Eintrag" : "Einträge"}
        </span>
      </header>

      {/* Quick-Chips */}
      <div className="flex flex-wrap gap-2">
        {verfuegbareTypen.map((chip) => {
          const selected = auftraege.some((a) => a.text === chip);
          return (
            <button
              key={chip}
              type="button"
              onClick={() => !selected && onAdd(chip)}
              disabled={selected}
              className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-default"
              style={
                selected
                  ? {
                      background: "var(--info-tint)",
                      color: "var(--info)",
                      borderColor: "rgba(37, 99, 235, 0.18)",
                    }
                  : {
                      background: "var(--surface-2)",
                      color: "var(--fg-2)",
                      borderColor: "transparent",
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                    }
              }
            >
              {selected ? (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--info)" }}
                />
              ) : (
                <span
                  className="text-[14px] font-bold leading-none"
                  style={{ color: "var(--fg-3)" }}
                >
                  +
                </span>
              )}
              {chip}
            </button>
          );
        })}
      </div>

      {/* Freitext-Input */}
      <div className="mt-3 flex gap-2.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Eigener Auftrag …"
          className="flex-1 rounded-[12px] border-[1.5px] px-4 py-3.5 text-[15px] font-medium outline-none transition placeholder:font-normal focus:outline-none"
          style={{
            background: "var(--surface-2)",
            borderColor: "transparent",
            color: "var(--fg)",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!input.trim()}
          className="grid h-[52px] w-[52px] place-items-center rounded-[12px] text-[22px] font-normal transition disabled:opacity-40"
          style={{
            background: "var(--fg)",
            color: "var(--bg)",
          }}
          aria-label="Auftrag hinzufügen"
        >
          <Plus size={22} strokeWidth={2.4} />
        </button>
      </div>

      {/* Liste der gewählten Aufträge */}
      {empty ? (
        <p
          className="mt-3.5 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ color: "var(--fg-3)" }}
        >
          Chip antippen oder Text eingeben
        </p>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-1.5">
          {auftraege.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-[12px] border-[1.5px] px-3.5 py-2.5"
              style={{
                background: "var(--info-tint)",
                borderColor: "rgba(37, 99, 235, 0.18)",
              }}
            >
              <span
                className="font-mono text-[11px] font-bold tabular-nums tracking-[0.05em]"
                style={{ color: "var(--info)" }}
              >
                {formatTime(a.zeitstempel)}
              </span>
              <span
                className="flex-1 text-[14px] font-semibold"
                style={{ color: "var(--fg)" }}
              >
                {a.text}
              </span>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                aria-label="Auftrag entfernen"
                className="grid h-7 w-7 place-items-center rounded-[8px] border transition"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  color: "var(--fg-3)",
                }}
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
