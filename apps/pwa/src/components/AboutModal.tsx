import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { AboutSection } from "./AboutSection";
import { FxToggle } from "./FxToggle";

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
 *
 * E-10 (Audit 2026-09): Der Performance-Modus (FxToggle) wohnt jetzt hier
 * als Zeile "Darstellung" unter den Geraete-Aktionen — im Footer war er
 * ein kryptisches Badge, das niemand zuordnen konnte.
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
        // Review 2026-09-06: kein backdrop-filter mehr auf dieser Vollbild-
        // Ebene — zusammen mit dem var(--blur-1)-Glaseffekt der Card
        // darunter (saturate(180%) blur(40px)) fuehrte der doppelt
        // gestapelte, teure Weichzeichner auf schwaecheren Handy-GPUs zu
        // einem schwarzen Bildschirm statt des Dialogs.
        background: "rgba(0,0,0,0.6)",
        display: "grid",
        placeItems: "center",
        padding: 16,
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
              fontSize: 25,
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

        {/* Geraete-Aktionen: Darstellung (E-10) + U-12 Tablet-Reset. Der
            Reset-Block bleibt an onResetSetup gebunden — im Setup-Screen
            (kein Prop) gibt es nur die Darstellungs-Zeile. */}
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
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--fg-3)",
              marginBottom: 8,
            }}
          >
            Geräte-Aktionen
          </div>

          {/* V-AB: Darstellung / Performance-Modus */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              padding: "6px 0 10px",
              ...(onResetSetup
                ? { borderBottom: "1px solid var(--border)", marginBottom: 12 }
                : {}),
            }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 16.5, fontWeight: 600, color: "var(--fg)" }}>
                Darstellung
              </div>
              <div style={{ fontSize: 14.5, color: "var(--fg-3)", lineHeight: 1.45, marginTop: 2 }}>
                Performance-Modus: <strong>Auto</strong> erkennt schwache Tablets und schaltet
                Glas-Effekte ab. Tippen wechselt Auto → Lite → Full.
              </div>
            </div>
            <FxToggle />
          </div>

          {onResetSetup &&
            (!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  fontSize: 16.5,
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
                Tablet zurücksetzen (Setup öffnen)
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
                <span style={{ fontSize: 16.5, color: "var(--warn)", flex: 1, minWidth: 200 }}>
                  Wirklich? Du musst danach wieder ein Fahrzeug auswählen
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
                    fontSize: 15,
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
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 36,
                  }}
                >
                  Ja, zurücksetzen
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
