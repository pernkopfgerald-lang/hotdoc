import type { EinsatzListItem, EinsatzTyp } from "../api/einsaetze";

/**
 * Gemeinsame Darstellungs-Bausteine fuer Berichts-Listen (Archiv,
 * Berichte-Browser, Detail). Aus pages/Verwaltung.tsx hierher verschoben,
 * damit components/* nicht mehr aus der Seite importieren muss (Zirkelimport
 * BerichteBrowser <-> Verwaltung).
 */

/** U-10: einheitliche Titel-Fallback-Kette fuer alle Berichts-Listen
 *  (Archiv + BerichteBrowser) — wie TypBadge exportiert, eine Wahrheit
 *  fuer alle Ansichten. Typspezifisch zuerst (Uebung → Thema,
 *  Lotsendienst → Auftraggeber), dann Einsatzart, Freitext, "—". */
export function berichtTitel(item: {
  einsatzTyp?: EinsatzTyp;
  einsatzart?: string;
  einsatzartFreitext?: string;
  uebungThema?: string;
  lotsendienstAuftraggeber?: string;
}): string {
  if (item.einsatzTyp === "uebung" && item.uebungThema) return item.uebungThema;
  if (item.einsatzTyp === "lotsendienst" && item.lotsendienstAuftraggeber) {
    return item.lotsendienstAuftraggeber;
  }
  return item.einsatzart ?? item.einsatzartFreitext ?? "—";
}

/**
 * D-06 (Audit R3): Lifecycle-Marker eines Berichts als Badge-Reihe.
 * Reihenfolge = Wichtigkeit: verworfen (rot) schlaegt alles; sonst der
 * Auto-Abschluss-Grund — "unbefuellt-1h" ist der Phantom-Fall (grau),
 * jeder andere Worker-Abschluss "auto-geschlossen" (gelb); zuletzt der
 * normale Status. Exportiert fuer Archiv, BerichteBrowser und BerichtDetail.
 */
export function LifecycleBadges({ item }: { item: EinsatzListItem }) {
  const istPhantom = item.autoAbgeschlossen === true && item.autoAbgeschlossenGrund === "unbefuellt-1h";
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      {item.verworfen === true ? (
        <span className="badge red" style={{ gap: 4 }} title="Vom Phantom-Cleanup als verworfen markiert">
          verworfen
        </span>
      ) : istPhantom ? (
        <span
          className="badge neutral"
          style={{ gap: 4 }}
          title="Automatisch geschlossen: nach 1 h ohne Eingaben (unbefüllt)"
        >
          Phantom (auto)
        </span>
      ) : item.autoAbgeschlossen === true ? (
        <span
          className="badge warn"
          style={{ gap: 4 }}
          title={`Automatisch geschlossen (${item.autoAbgeschlossenGrund ?? "Grund unbekannt"})`}
        >
          auto-geschlossen
        </span>
      ) : null}
      {item.status === "aktiv" ? (
        <span className="badge ok" style={{ gap: 4 }}>aktiv</span>
      ) : (
        <span className="badge neutral" style={{ gap: 4 }}>geschützt</span>
      )}
    </span>
  );
}

/** AUDIT-15: exportiert, damit BerichteBrowser/BerichtDetail dasselbe
 *  Badge rendern wie das Archiv — eine Wahrheit fuer alle Ansichten. */
export function TypBadge({ typ }: { typ: EinsatzTyp }) {
  const meta: Record<EinsatzTyp, { label: string; color: string }> = {
    alarm: { label: "ALARM", color: "var(--red)" },
    manuell: { label: "MANUELL", color: "var(--info)" },
    lotsendienst: { label: "LOTSE", color: "var(--warn)" },
    uebung: { label: "ÜBUNG", color: "var(--ok)" },
  };
  const m = meta[typ];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: 6,
        background: `color-mix(in srgb, ${m.color} 18%, transparent)`,
        color: m.color,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.12em",
        border: `1px solid color-mix(in srgb, ${m.color} 40%, transparent)`,
      }}
    >
      {m.label}
    </span>
  );
}
