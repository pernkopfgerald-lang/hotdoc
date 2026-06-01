import { AlertTriangle, CheckCircle2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  /** Was wird geschlossen? z.B. "Brandeinsatz Steinerkirchen" */
  tabLabel: string;
  /** Setzen wenn der User einen Hauptauftrag schließt (Florianstation).
   *  Zeigt zusätzlichen Hinweis: "schließt auch alle Fahrzeugberichte". */
  isHauptauftrag?: boolean;
  onClose: () => void;
  /**
   * Schließen mit Speichern. Bericht bleibt im Archiv,
   * PDF wird generiert. Standard-Aktion (primary).
   */
  onConfirmAbschluss: () => Promise<void> | void;
  /**
   * Schließen ohne Speichern (Verwerfen). Bericht wird
   * mit `verworfen=true` markiert. Nur wenn Backend
   * /verwerfen-Endpoint verfügbar ist (Tab-Schließen,
   * nicht bei Auto-Save-Flow).
   */
  onConfirmVerwerfen?: (grund: string) => Promise<void> | void;
}

/**
 * Tab-Schließen-Dialog.
 *
 * Drei Aktionen:
 *  1. "Mit Speichern abschließen" (primary, grün) — POST abschluss
 *  2. "Ohne Speichern verwerfen" (sekundär, rot, mit 2nd-confirm) — POST verwerfen
 *  3. "Abbrechen" — onClose
 *
 * Verwerfen verlangt einen Grund (min 3 Zeichen) damit das Archiv
 * nachvollziehbar bleibt.
 */
export function CloseTabConfirmModal({
  open,
  tabLabel,
  isHauptauftrag,
  onClose,
  onConfirmAbschluss,
  onConfirmVerwerfen,
}: Props) {
  const [step, setStep] = useState<"choice" | "verwerfen-confirm">("choice");
  const [grund, setGrund] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("choice");
      setGrund("");
      setBusy(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  async function handleAbschluss() {
    setBusy(true);
    setError(null);
    try {
      await onConfirmAbschluss();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Abschluss fehlgeschlagen — Verbindung?",
      );
      setBusy(false);
    }
  }

  async function handleVerwerfen() {
    if (!onConfirmVerwerfen) return;
    if (grund.trim().length < 3) {
      setError("Bitte einen kurzen Grund angeben (min. 3 Zeichen).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirmVerwerfen(grund.trim());
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Verwerfen fehlgeschlagen — Verbindung?",
      );
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-tab-title"
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(4px)",
        }}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        style={{
          position: "relative",
          width: "min(480px, 100%)",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: 0,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-2)",
          }}
        >
          <AlertTriangle size={18} style={{ color: "var(--warn)" }} />
          <h3
            id="close-tab-title"
            style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}
          >
            {step === "choice" ? "Bericht schließen?" : "Verwerfen bestätigen"}
          </h3>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            aria-label="Schließen"
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              color: "var(--fg-2)",
            }}
          >
            <X size={18} />
          </button>
        </header>

        <div style={{ padding: 18 }}>
          {step === "choice" && (
            <>
              <p style={{ margin: "0 0 14px", fontSize: 14, color: "var(--fg-2)" }}>
                Was soll mit{" "}
                <strong style={{ color: "var(--fg)" }}>{tabLabel}</strong>{" "}
                passieren?
              </p>
              {isHauptauftrag && (
                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: 12,
                    color: "var(--warn)",
                    background: "var(--warn-tint)",
                    border: "1px solid var(--amber-border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  Hauptauftrag — schließt auch alle noch offenen
                  Fahrzeugberichte mit.
                </p>
              )}

              <button
                type="button"
                onClick={handleAbschluss}
                disabled={busy}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  marginBottom: 8,
                  background: "var(--ok-tint)",
                  border: "1px solid var(--green-border)",
                  color: "var(--ok)",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? "wait" : "pointer",
                  textAlign: "left",
                }}
              >
                <CheckCircle2 size={18} />
                <span style={{ flex: 1 }}>
                  Mit Speichern abschließen
                  <span
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 400,
                      opacity: 0.8,
                      marginTop: 2,
                    }}
                  >
                    Bericht landet im Archiv, PDF wird generiert.
                  </span>
                </span>
              </button>

              {onConfirmVerwerfen && (
                <button
                  type="button"
                  onClick={() => setStep("verwerfen-confirm")}
                  disabled={busy}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                    marginBottom: 8,
                    background: "transparent",
                    border: "1px solid var(--red-border, #d93b3b)",
                    color: "var(--red)",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: busy ? "wait" : "pointer",
                    textAlign: "left",
                  }}
                >
                  <Trash2 size={18} />
                  <span style={{ flex: 1 }}>
                    Ohne Speichern verwerfen
                    <span
                      style={{
                        display: "block",
                        fontSize: 11,
                        fontWeight: 400,
                        opacity: 0.8,
                        marginTop: 2,
                      }}
                    >
                      Bericht wird als „verworfen" markiert. Im Archiv
                      auffindbar, aber nicht in der Statistik.
                    </span>
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  marginTop: 4,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-2)",
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                Abbrechen
              </button>
            </>
          )}

          {step === "verwerfen-confirm" && (
            <>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fg-2)" }}>
                Bitte einen kurzen Grund angeben, warum der Bericht verworfen
                wird. Das hilft beim späteren Audit-Trail.
              </p>
              <input
                type="text"
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                placeholder="z.B. Fehlalarm, Test-Daten, falsch angelegt"
                autoFocus
                disabled={busy}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 8,
                  fontSize: 14,
                  color: "var(--fg)",
                  marginBottom: 12,
                  outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setStep("choice")}
                  disabled={busy}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--fg-2)",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  Zurück
                </button>
                <button
                  type="button"
                  onClick={handleVerwerfen}
                  disabled={busy || grund.trim().length < 3}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    background: "var(--red, #d93b3b)",
                    border: 0,
                    color: "white",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: busy || grund.trim().length < 3 ? "not-allowed" : "pointer",
                    opacity: grund.trim().length < 3 ? 0.5 : 1,
                  }}
                >
                  {busy ? "Verwerfe…" : "Verwerfen"}
                </button>
              </div>
            </>
          )}

          {error && (
            <p
              style={{
                marginTop: 12,
                padding: "8px 10px",
                background: "var(--danger-tint, rgba(217,59,59,0.12))",
                border: "1px solid var(--red-border, #d93b3b)",
                color: "var(--red)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
