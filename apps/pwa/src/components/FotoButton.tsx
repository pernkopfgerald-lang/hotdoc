import { Camera } from "lucide-react";
import { useRef } from "react";

/**
 * Foto-Funktion (2026-06-03): Kamera-Button für die Einsatzchronik.
 *
 * Nutzt einen versteckten <input type="file" accept="image/*" capture="environment">
 * — auf Tablet/Handy öffnet das direkt die Rückkamera, am Desktop den Datei-
 * dialog. Kein Capacitor-Camera-Plugin nötig (funktioniert in PWA + WebView).
 * Der Aufrufer bekommt das rohe File und kümmert sich um Komprimierung +
 * Speicherung (lib/foto.ts).
 */
interface Props {
  onCapture: (file: File) => void;
  busy?: boolean;
}

export function FotoButton({ onCapture, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onCapture(f);
          // Reset damit dasselbe Foto theoretisch erneut gewählt werden kann
          // und onChange auch beim zweiten Mal feuert.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Foto zur Chronik hinzufügen"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          width: "100%",
          minHeight: 52,
          marginTop: 8,
          padding: "0 16px",
          borderRadius: 12,
          border: "1px solid var(--border-strong)",
          background: "var(--surface-2)",
          color: "var(--fg)",
          fontWeight: 600,
          fontSize: 19,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        <Camera size={18} strokeWidth={2.2} />
        {busy ? "Foto wird verarbeitet …" : "Foto hinzufügen"}
      </button>
    </>
  );
}
