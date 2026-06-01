import { CheckCircle2, ChevronDown, Lock, Plus, Siren, X } from "lucide-react";

export interface EinsatzTabSummary {
  id: string;
  einsatzart: string;
  einsatzort: string;
  status: "aktiv" | "abgeschlossen";
  manuell: boolean;
}

interface Props {
  tabs: EinsatzTabSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  /**
   * Optional. Wenn gesetzt: zeigt ein × an jedem Tab. Klick triggert
   * den Schliessen-Dialog im Parent. Parent entscheidet was passiert
   * (abschliessen mit Speichern / verwerfen / abbrechen).
   */
  onCloseTab?: (id: string) => void;
}

/**
 * Browser-Tab-Style Reiter über alle aktuell offenen Aufträge dieses
 * Tablets. Klick wechselt den aktuellen Auftrag, "+" legt einen neuen
 * an (übernimmt Personal aus dem aktiven Auftrag — Einsatzort wählt
 * der Nutzer).
 *
 * Abgeschlossene Aufträge werden NICHT mehr in der Tab-Leiste angezeigt
 * (User-Wunsch). Sie sind nur noch im Archiv erreichbar. Frueher war
 * der Tab visuell abgegraut sichtbar — das hat den Funktionaer verwirrt
 * weil er gedacht hat er kann noch was eingeben.
 */
export function EinsatzTabs({ tabs, activeId, onSelect, onNew, onCloseTab }: Props) {
  const visible = tabs.filter((t) => t.status !== "abgeschlossen");
  if (visible.length === 0) return null;
  return (
    <div
      className="sticky top-[68px] z-[15] flex items-end gap-1 overflow-x-auto px-4 pt-1.5"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--bg) 92%, transparent) 0%, var(--bg) 100%)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {visible.map((t) => (
        <EinsatzTab
          key={t.id}
          tab={t}
          active={t.id === activeId}
          onClick={() => onSelect(t.id)}
          {...(onCloseTab ? { onClose: () => onCloseTab(t.id) } : {})}
        />
      ))}
      <button
        type="button"
        onClick={onNew}
        className="ml-1 flex shrink-0 items-center gap-1.5 rounded-t-[12px] border-x border-t px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] transition"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--border)",
          color: "var(--fg-2)",
        }}
        title="Neuen Einsatz/Übung/Lotsendienst anlegen"
      >
        <Plus size={13} />
        Neuer Einsatz
      </button>
    </div>
  );
}

function EinsatzTab({
  tab,
  active,
  onClick,
  onClose,
}: {
  tab: EinsatzTabSummary;
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
}) {
  const closed = tab.status === "abgeschlossen";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-current={active}
      className="group flex shrink-0 items-center gap-2 rounded-t-[12px] border-x border-t px-3.5 py-2 text-left transition cursor-pointer"
      style={{
        background: active ? "var(--surface)" : "var(--surface-2)",
        borderColor: active ? "var(--border-strong)" : "var(--border)",
        borderBottom: active ? "1px solid var(--surface)" : "0",
        marginBottom: active ? "-1px" : "0",
        color: active ? "var(--fg)" : "var(--fg-2)",
        boxShadow: active ? "0 -2px 6px rgba(15, 23, 42, 0.04)" : undefined,
      }}
    >
      <span
        className="grid h-6 w-6 place-items-center rounded-md"
        style={{
          background: closed
            ? "var(--ok-tint)"
            : active
              ? "var(--red-tint)"
              : "var(--surface-3)",
          color: closed ? "var(--ok)" : active ? "var(--red)" : "var(--fg-3)",
        }}
      >
        {closed ? <CheckCircle2 size={13} /> : tab.manuell ? <Plus size={13} /> : <Siren size={13} />}
      </span>
      <div className="flex flex-col leading-tight">
        <span className="max-w-[180px] truncate text-[13px] font-semibold tracking-tight">
          {tab.einsatzart}
        </span>
        <span
          className="font-mono text-[9px] font-medium uppercase tracking-[0.1em]"
          style={{ color: closed ? "var(--ok)" : active ? "var(--red)" : "var(--fg-3)" }}
        >
          {closed ? (
            <span className="inline-flex items-center gap-1">
              <Lock size={9} /> geschlossen
            </span>
          ) : tab.manuell ? (
            "Folgeauftrag"
          ) : (
            "Aktiv"
          )}
        </span>
      </div>
      {active ? <ChevronDown size={12} className="ml-1 opacity-50" /> : null}
      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Bericht schließen"
          title="Bericht schließen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 22,
            height: 22,
            marginLeft: 4,
            borderRadius: 6,
            background: "transparent",
            border: 0,
            color: "var(--fg-3)",
            cursor: "pointer",
            transition: "background 120ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--surface-3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <X size={12} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
