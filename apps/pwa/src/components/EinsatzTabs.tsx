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
        // U-13: Tooltip + aria-label klarer — der "+"-Button oeffnet eine
        // Auswahl ueber Einsatz / Uebung / Lotsendienst.
        title="Neuen Einsatz anlegen — Auswahl: Einsatz · Übung · Lotsendienst"
        aria-label="Neuen Einsatz anlegen — Auswahl: Einsatz · Übung · Lotsendienst"
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
      /* EL-05 (Audit 2026-06-12): voller Kontext im Tooltip — Einsatzart UND
         Ort, damit bei mehreren ähnlichen Tabs klar ist welcher gemeint ist. */
      title={`${tab.einsatzart}${tab.einsatzort ? " · " + tab.einsatzort : ""}`}
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
      {/* D-14: Status-Icon (CheckCircle/Plus/Siren) reicht — die Sub-Label
          "Aktiv"/"Folgeauftrag" sind redundant zum Icon. Nur die
          "geschlossen"-Variante mit Lock-Icon bleibt sichtbar, weil das ein
          stark abgesetzter Endstatus ist (selten gezeigt, Funktionaer soll
          ihn klar sehen). */}
      <div className="flex flex-col leading-tight">
        {/* KDT-13b + EL-05 (Audit 2026-06-12): FIXE Breiten 140px (Tablet) /
            220px (Desktop) statt 80/180 max-w — damit wandert das X bei
            wechselnden Texten nicht, und unter der Einsatzart steht eine
            zweite Zeile mit dem Einsatzort (auf ~30 Zeichen begrenzt). Bei
            zwei gleichzeitigen "Brandeinsatz"-Tabs war vorher nicht
            unterscheidbar, welcher zu welcher Adresse gehört. */}
        <span className="w-[140px] max-w-[140px] sm:w-[220px] sm:max-w-[220px] truncate text-[13px] font-semibold tracking-tight">
          {tab.einsatzart}
        </span>
        {tab.einsatzort ? (
          <span
            className="w-[140px] max-w-[140px] sm:w-[220px] sm:max-w-[220px] truncate font-mono text-[11px]"
            style={{ color: "var(--fg-3)" }}
          >
            {tab.einsatzort.length > 30
              ? `${tab.einsatzort.slice(0, 30)}…`
              : tab.einsatzort}
          </span>
        ) : null}
        {closed ? (
          <span
            className="font-mono text-[9px] font-medium uppercase tracking-[0.1em] inline-flex items-center gap-1"
            style={{ color: "var(--ok)" }}
          >
            <Lock size={9} /> geschlossen
          </span>
        ) : null}
      </div>
      {active ? <ChevronDown size={12} className="ml-1 opacity-50" /> : null}
      {onClose && (
        /* KDT-13b (Audit 2026-06-12): X-Button auf echte 44x44. Der alte
           U-19-Kommentar ("32x32 + padding 8 = 48x48") war falsch — durch
           Tailwind-Preflight gilt box-sizing:border-box, das padding zählt
           INNERHALB von width/height; effektiv waren es nur 32x32. */
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Bericht schliessen"
          title="Bericht schliessen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            marginLeft: 4,
            padding: 8,
            borderRadius: 8,
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
          <X size={16} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
