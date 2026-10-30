import { AlertTriangle } from "lucide-react";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Faengt Fehler eines Verwaltungs-Bereichs ab — insbesondere das Scheitern
 * eines lazy nachgeladenen Chunks (nach einem Deploy kennt der Server die
 * Datei der alten Seite nicht mehr). React.lazy merkt sich den Fehlschlag,
 * "erneut versuchen" hilft daher nicht: nur ein Neuladen der Seite.
 * Verwendung mit `key={tab}`, damit ein Tab-Wechsel den Fehler zuruecksetzt.
 */
export class PanelBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          padding: "14px 16px",
          borderRadius: 10,
          background: "var(--red-tint)",
          color: "var(--red)",
          fontSize: 13,
          border: "1px solid var(--red-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <AlertTriangle size={16} />
        <span>
          Dieser Bereich konnte nicht geladen werden (evtl. wurde HotDoc inzwischen aktualisiert).
        </span>
        <button
          type="button"
          className="chip"
          onClick={() => window.location.reload()}
        >
          Seite neu laden
        </button>
      </div>
    );
  }
}
