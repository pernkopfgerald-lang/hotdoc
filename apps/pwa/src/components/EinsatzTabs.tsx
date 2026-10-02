import { Lock, Plus, X } from "lucide-react";
import { useEffect, useRef } from "react";

export interface EinsatzTabSummary {
  id: string;
  einsatzart: string;
  einsatzort: string;
  status: "aktiv" | "abgeschlossen";
  manuell: boolean;
  /** Z-05 (Audit 2026-07-03): Einsatz-Typ fuer Icon + Farbton des Tabs.
   *  Optional — Callsites ohne Typ-Info fallen auf die bisherige
   *  manuell/alarm-Unterscheidung (Plus/Siren) zurueck. */
  einsatzTyp?: "alarm" | "manuell" | "uebung" | "lotsendienst";
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
      className="sticky z-[15] flex items-stretch gap-2 overflow-x-auto px-4 py-2"
      style={{
        // V-06 (Audit R3): an die echte Topbar-Hoehe gekoppelt (75/71 px).
        top: "var(--topbar-h, 75px)",
        background: "var(--bg)",
        borderBottom: "1px solid var(--border-strong)",
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
        className="flex shrink-0 items-center gap-1.5 px-4 py-2 text-[15px] font-bold"
        style={{
          background: "var(--btn)",
          border: "1px solid var(--btn)",
          borderRadius: 4,
          color: "var(--btn-fg)",
        }}
        // U-13: Tooltip + aria-label klarer — der "+"-Button oeffnet eine
        // Auswahl ueber Einsatz / Uebung / Lotsendienst.
        // E-03 (Audit 2026-09): "Bericht" statt "Einsatz" — das Modal legt
        // auch Uebungen und Lotsendienste an.
        title="Neuen Bericht anlegen — Einsatz ohne Alarm · Übung · Lotsendienst"
        aria-label="Neuen Bericht anlegen — Einsatz ohne Alarm · Übung · Lotsendienst"
      >
        <Plus size={15} />
        Neuer Bericht
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
  // Z-05: Icon + Farbton je Einsatz-Typ — Übung grün (--ok), Alarm rot
  // (--red, wie bisher), manuell blau (--info), Lotsendienst orange (--warn).
  // Fallback fuer Callsites ohne einsatzTyp: manuell-Flag wie frueher.
  const typ = tab.einsatzTyp ?? (tab.manuell ? "manuell" : "alarm");
  const typStil =
    typ === "uebung"
      ? { farbe: "#2E9B58" }
      : typ === "manuell"
        ? { farbe: "#3B7DD8" }
        : typ === "lotsendienst"
          ? { farbe: "#D98A1E" }
          : { farbe: "#E5303C" };
  // S-14 (Audit 2026-09): den aktiven Tab in der horizontal scrollbaren
  // Leiste sichtbar halten — bei 3+ Einsaetzen lag der per Auto-Open
  // gewaehlte Tab sonst rechts ausserhalb des Viewports.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active) return;
    try {
      rootRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    } catch {
      // aeltere WebViews ohne Options-Objekt — Komfort, kein Muss
    }
  }, [active]);
  return (
    <div
      ref={rootRef}
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
      className="group flex shrink-0 items-center gap-2.5 px-3.5 py-1.5 text-left cursor-pointer"
      style={{
        background: active ? "var(--btn)" : "var(--surface)",
        border: `1px solid ${active ? "var(--btn)" : "var(--border-strong)"}`,
        borderRadius: 4,
        color: active ? "var(--btn-fg)" : "var(--fg)",
      }}
    >
      {/* Typ-Marke: kleines Quadrat in der Typ-Farbe (Alarm rot, manuell blau,
          Uebung gruen, Lotsendienst braun) — statt Icon-Kaestchen. */}
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          flexShrink: 0,
          background: closed ? "#1D6B3B" : typStil.farbe,
          border: active ? "1px solid #fff" : "none",
        }}
      />
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
        <span className="w-[140px] max-w-[140px] sm:w-[220px] sm:max-w-[220px] truncate text-[16px] font-bold">
          {tab.einsatzart}
        </span>
        {tab.einsatzort ? (
          <span
            className="w-[140px] max-w-[140px] sm:w-[220px] sm:max-w-[220px] truncate text-[13.5px]"
            style={{ color: active ? "var(--btn-fg)" : "var(--fg-3)" }}
          >
            {tab.einsatzort.length > 30
              ? `${tab.einsatzort.slice(0, 30)}…`
              : tab.einsatzort}
          </span>
        ) : null}
        {closed ? (
          <span
            className="text-[12px] font-medium inline-flex items-center gap-1"
            style={{ color: "var(--ok)" }}
          >
            <Lock size={9} /> geschlossen
          </span>
        ) : null}
      </div>
      {/* Z-12: X nur am AKTIVEN Tab — auf inaktiven Tabs war das X direkt
          neben der Klickflaeche zum Wechseln und wurde versehentlich
          getroffen (Schliessen-Dialog statt Tab-Wechsel). */}
      {onClose && active && (
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
          aria-label="Bericht schließen"
          title="Bericht schließen"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            marginLeft: 4,
            padding: 8,
            borderRadius: 4,
            background: "transparent",
            border: 0,
            color: "var(--btn-fg)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--btn-hover)";
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
