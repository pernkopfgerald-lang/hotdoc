import { Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  /** Aktueller Text-Inhalt. Bei jedem Re-Render synchronisiert. */
  text: string;
  /** Wird gerufen wenn der User einen neuen Text via Enter/Blur committed. */
  onUpdate: (next: string) => void;
  /** Wird gerufen wenn der User X klickt. */
  onRemove: () => void;
  /** CSS-Klassen für den Chip-Wrapper (default "chip task selected"). */
  className?: string;
  /** Style-Overrides (Farben etc.). */
  style?: React.CSSProperties;
  /** Edit-Modus deaktivierbar (Read-only Anzeige). */
  readOnly?: boolean;
  /** Validation des neuen Werts. Liefert null bei OK oder Fehler-String. */
  validate?: (next: string) => string | null;
}

/**
 * Bearbeitbarer Chip mit Inline-Edit-Mode.
 *
 * Standard-Ansicht: [● text Bleistift ✕]
 * Bearbeiten:       [● <input>           ✓ ✕]
 *
 * Trigger:
 *  - Click auf Bleistift-Icon → Edit-Modus
 *  - Enter ODER Blur → speichern (wenn nicht leer + geändert)
 *  - Escape → abbrechen ohne Speichern
 *  - Check-Icon → speichern
 *  - X-Icon (im Edit-Modus) → abbrechen
 *  - X-Icon (im Read-Modus) → entfernen
 *
 * Touch-tauglich: Bleistift- und X-Icons sind echte Buttons (kein Hover-only).
 */
export function EditableChip({
  text,
  onUpdate,
  onRemove,
  className = "chip task selected",
  style,
  readOnly = false,
  validate,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [validationErr, setValidationErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Wenn der Wert von außen geändert wurde (z.B. nach Save-Reload),
  // den lokalen State synchronisieren — aber nur wenn nicht gerade editiert.
  useEffect(() => {
    if (!editing) setValue(text);
  }, [text, editing]);

  // Auto-Focus + Cursor ans Ende beim Eintritt in den Edit-Modus
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      const len = inputRef.current.value.length;
      inputRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  function commit() {
    const cleaned = value.trim();
    if (!cleaned) {
      abort();
      return;
    }
    if (validate) {
      const err = validate(cleaned);
      if (err) {
        setValidationErr(err);
        return;
      }
    }
    setValidationErr(null);
    setEditing(false);
    if (cleaned !== text) onUpdate(cleaned);
  }

  function abort() {
    setValue(text);
    setValidationErr(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <span
        className={className}
        style={{
          ...style,
          gap: 6,
          borderColor: validationErr ? "var(--red)" : "var(--info)",
          background: validationErr ? "var(--red-tint)" : "var(--info-tint)",
          paddingRight: 4,
        }}
        title={validationErr ?? undefined}
      >
        <span className="dot" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (validationErr) setValidationErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              abort();
            }
          }}
          onBlur={(e) => {
            // Nur committen wenn der Blur NICHT auf einen unserer Buttons geht
            const next = e.relatedTarget as HTMLElement | null;
            if (next?.dataset?.chipAction) return;
            commit();
          }}
          style={{
            background: "transparent",
            border: 0,
            outline: "none",
            color: "inherit",
            font: "inherit",
            minWidth: 60,
            maxWidth: 320,
            padding: 0,
          }}
        />
        <button
          type="button"
          data-chip-action="commit"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          aria-label="Speichern"
          title="Speichern (Enter)"
          style={iconBtnStyle("ok")}
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          data-chip-action="abort"
          onMouseDown={(e) => e.preventDefault()}
          onClick={abort}
          aria-label="Abbrechen"
          title="Abbrechen (Esc)"
          style={iconBtnStyle("muted")}
        >
          <X size={13} />
        </button>
      </span>
    );
  }

  return (
    <span className={className} style={{ ...style, gap: 8 }}>
      <span className="dot" />
      <span>{text}</span>
      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Bearbeiten"
            title="Bearbeiten"
            style={iconBtnStyle("muted")}
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Entfernen"
            title="Entfernen"
            style={iconBtnStyle("muted")}
          >
            <X size={13} />
          </button>
        </>
      )}
    </span>
  );
}

function iconBtnStyle(variant: "ok" | "muted"): React.CSSProperties {
  return {
    background: "transparent",
    border: 0,
    color: variant === "ok" ? "var(--ok)" : "inherit",
    cursor: "pointer",
    padding: 2,
    marginLeft: 2,
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 4,
    opacity: 0.75,
  };
}
