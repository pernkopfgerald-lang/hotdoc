import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  /** Fliesstext; Zeilenumbrueche (\n) bleiben erhalten. */
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Rot hervorgehobene Bestaetigung fuer destruktive Aktionen. */
  danger?: boolean | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Kleiner, wiederverwendbarer Bestaetigungsdialog – Ersatz fuer
 * window.confirm (blockiert den UI-Thread, nicht stylebar, wirkt in der
 * APK/PWA wie ein System-Dialog). Muster wie CloseTabConfirmModal:
 *  - feste Ebene ueber der App
 *  - Escape = Abbrechen
 *  - Backdrop schliesst NICHT (kein versehentliches Bestaetigen/Abbrechen
 *    durch Tipp neben den Dialog)
 *  - grosse Buttons (>= 44 px Tippflaeche)
 */
export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const accent = danger ? "var(--red, #d93b3b)" : "var(--accent)";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
      onClick={(e) => e.stopPropagation()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-text"
    >
      {/* Backdrop schliesst bewusst NICHT. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "min(480px, 100%)",
          maxHeight: "100%",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          boxShadow: "var(--glass-shadow-1)",
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
          <AlertTriangle
            size={18}
            style={{ color: danger ? "var(--red)" : "var(--warn)", flexShrink: 0 }}
          />
          <h3
            id="confirm-dialog-title"
            style={{ margin: 0, fontSize: 20, fontWeight: 700, flex: 1 }}
          >
            {title}
          </h3>
        </header>
        <div style={{ padding: 18 }}>
          <p
            id="confirm-dialog-text"
            style={{
              margin: "0 0 18px",
              fontSize: 17.5,
              lineHeight: 1.45,
              color: "var(--fg-2)",
              whiteSpace: "pre-line",
              overflowWrap: "break-word",
            }}
          >
            {text}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={onCancel}
              autoFocus
              style={{
                flex: "1 1 140px",
                minHeight: 48,
                padding: "10px 14px",
                background: "var(--surface-2)",
                border: "1px solid var(--border-strong)",
                color: "var(--fg)",
                borderRadius: 4,
                fontSize: 17,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                flex: "1 1 140px",
                minHeight: 48,
                padding: "10px 14px",
                background: accent,
                border: 0,
                color: "#fff",
                borderRadius: 4,
                fontSize: 17,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
