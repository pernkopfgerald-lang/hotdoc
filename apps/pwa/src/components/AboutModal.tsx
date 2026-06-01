import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { AboutSection } from "./AboutSection";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * U-12: Tablet-Reset (Setup wieder oeffnen). Frueher war der Button
   * direkt in der Fusszeile — viel zu gefaehrlich, weil ein versehentlicher
   * Klick das Tablet aus der Sitzung wirft. Jetzt nur hier unter zwei
   * Confirm-Klicks erreichbar.
   */
  onResetSetup?: () => void;
}

/**
 * Modal-Wrap fuer die About-Seite. Wird ueber den "Über" Link im Footer
 * oder Setup-Screen geoeffnet.
 */
export function AboutModal({ open, onClose, onResetSetup }: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1900,
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        backdropFilter: "blur(12px) saturate(150%)",
        WebkitBackdropFilter: "blur(12px) saturate(150%)",
        animation: "glass-reveal 220ms var(--ease-decel) both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, calc(100% - 24px))",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "auto",
          background: "var(--glass-1)",
          backdropFilter: "var(--blur-1)",
          WebkitBackdropFilter: "var(--blur-1)",
          color: "var(--fg)",
          borderRadius: "var(--radius-xl)",
          border: "1px solid var(--glass-border-strong)",
          boxShadow: "var(--glass-shadow-1)",
          padding: 22,
          animation: "glass-reveal 320ms var(--ease-spring) both",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            Über HotDoc
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="icon-btn"
          >
            <X size={16} />
          </button>
        </header>
        <AboutSection />

        {/* U-12: Tablet-Reset gehoert hierher — nicht in die Fusszeile. */}
        {onResetSetup && (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              borderRadius: 12,
              border: "1px dashed var(--border-strong)",
              background: "var(--surface-2)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--fg-3)",
                marginBottom: 8,
              }}
            >
              Geraete-Aktionen
            </div>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  background: "transparent",
                  color: "var(--fg-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  cursor: "pointer",
                  minHeight: 44,
                }}
              >
                <RotateCcw size={14} />
                Tablet zuruecksetzen (Setup oeffnen)
              </button>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  background: "var(--warn-tint)",
                  border: "1px solid var(--amber-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <AlertTriangle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--warn)", flex: 1, minWidth: 200 }}>
                  Wirklich? Du musst danach wieder ein Fahrzeug auswaehlen
                  und der laufende Bericht ist im Backend gespeichert.
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  style={{
                    padding: "8px 12px",
                    background: "transparent",
                    color: "var(--fg)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    minHeight: 36,
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset(false);
                    onClose();
                    onResetSetup();
                  }}
                  style={{
                    padding: "8px 14px",
                    background: "var(--warn)",
                    color: "#fff",
                    border: 0,
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 36,
                  }}
                >
                  Ja, zuruecksetzen
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
