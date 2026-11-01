import { Plus, UserPlus, X } from "lucide-react";

interface Props {
  fahrer?: string | undefined;
  kdt?: string | undefined;
  mannschaft: ReadonlyArray<{ personId: number; name: string }>;
  /** Noch freie Mannschaftsplaetze (0 = voll). */
  freiePlaetze: number;
  busy: boolean;
  fehler: string | null;
  onFahrer: () => void;
  onKdt: () => void;
  onHinzufuegen: () => void;
  onEntferne: (personId: number) => void;
}

const LABEL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12.5,
  color: "var(--fg-3)",
  alignSelf: "center",
};

const KNOPF: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 4,
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  background: "var(--surface)",
  color: "var(--fg)",
  border: "1px solid var(--border-strong)",
};

/**
 * Personal eines Fahrzeugs durch die Florianstation eintragen (Fahrer, Fahrzeug-Kdt,
 * Mannschaft) — gleiche Daten wie im Fahrzeugbericht des Tablets. Rendert Zeilen eines
 * Zwei-Spalten-Rasters (Bezeichnung | Wert); der Aufrufer stellt das Raster.
 *
 * Fahrer und Kdt lassen sich ersetzen, aber nicht leeren (das kann der Server nicht).
 * Die Mannschaft laesst sich ergaenzen und je Person entfernen.
 */
export function FahrzeugPersonalEditor({
  fahrer,
  kdt,
  mannschaft,
  freiePlaetze,
  busy,
  fehler,
  onFahrer,
  onKdt,
  onHinzufuegen,
  onEntferne,
}: Props) {
  return (
    <>
      <span style={LABEL}>Fahrer</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong>{fahrer ?? "—"}</strong>
        <button type="button" style={KNOPF} disabled={busy} onClick={onFahrer}>
          <UserPlus size={16} />
          {fahrer ? "Ändern" : "Eintragen"}
        </button>
      </div>

      <span style={LABEL}>Fahrzeug-Kdt.</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong>{kdt ?? "—"}</strong>
        <button type="button" style={KNOPF} disabled={busy} onClick={onKdt}>
          <UserPlus size={16} />
          {kdt ? "Ändern" : "Eintragen"}
        </button>
      </div>

      <span style={LABEL}>Mannschaft</span>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {mannschaft.length > 0 ? (
          mannschaft.map((m) => (
            <div key={m.personId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 500 }}>{m.name}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onEntferne(m.personId)}
                aria-label={`${m.name} aus der Mannschaft entfernen`}
                title="Aus der Mannschaft entfernen"
                style={{ ...KNOPF, padding: 0, width: 44, justifyContent: "center", color: "var(--red)" }}
              >
                <X size={16} />
              </button>
            </div>
          ))
        ) : (
          <span style={{ color: "var(--fg-3)" }}>(noch keine Mannschaft erfasst)</span>
        )}
        <div>
          <button
            type="button"
            style={{ ...KNOPF, opacity: freiePlaetze === 0 ? 0.5 : 1 }}
            disabled={busy || freiePlaetze === 0}
            onClick={onHinzufuegen}
          >
            <Plus size={16} />
            {freiePlaetze === 0 ? "Alle Plätze belegt" : `Personen hinzufügen (${freiePlaetze} frei)`}
          </button>
        </div>
      </div>

      {fehler ? (
        <div
          role="alert"
          style={{
            gridColumn: "1 / -1",
            fontSize: 15,
            padding: "8px 12px",
            borderRadius: 4,
            background: "var(--red-tint)",
            color: "var(--red)",
            border: "1px solid var(--red-border)",
          }}
        >
          {fehler}
        </div>
      ) : null}
    </>
  );
}
