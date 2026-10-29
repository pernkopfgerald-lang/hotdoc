import { AlertTriangle, Flame, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { EINSATZARTEN, kategorieFuer } from "@hotdoc/shared";

interface Props {
  open: boolean;
  /** Bereits gesetzte bzw. automatisch vorgeschlagene Einsatzart. */
  vorschlag?: string | undefined;
  /** true = `vorschlag` wurde automatisch aus dem Alarm abgeleitet und ist noch nicht bestaetigt. */
  automatisch?: boolean | undefined;
  busy?: boolean;
  error?: string | null;
  onWahl: (art: string) => void;
  onAbbruch: () => void;
}

const BRAND_ARTEN = EINSATZARTEN.filter((a) => kategorieFuer(a) === "brand");
const TECHNISCH_ARTEN = EINSATZARTEN.filter((a) => kategorieFuer(a) === "technisch");

/**
 * Einsatzart waehlen bzw. bestaetigen — VOR dem Abschluss.
 *
 * Die Einsatzart bestimmt die Berichtsnummer (B26-… = Brand, T26-… = Technisch)
 * und den Abschluss-Ablauf (Brand-Statistik-Assistent). Fehlt sie, galt frueher
 * still "technisch"; jetzt muss die Mannschaft sie bewusst waehlen.
 */
export function EinsatzartWahlModal({ open, vorschlag, automatisch, busy, error, onWahl, onAbbruch }: Props) {
  const [auswahl, setAuswahl] = useState<string>("");

  useEffect(() => {
    if (open) setAuswahl(vorschlag ?? "");
  }, [open, vorschlag]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onAbbruch();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onAbbruch]);

  if (!open) return null;

  const kategorie = auswahl ? kategorieFuer(auswahl) : null;

  function kachel(art: string) {
    const aktiv = auswahl === art;
    return (
      <button
        key={art}
        type="button"
        onClick={() => setAuswahl(art)}
        disabled={busy}
        aria-pressed={aktiv}
        style={{
          textAlign: "left",
          padding: "10px 12px",
          borderRadius: 4,
          fontSize: 16,
          fontWeight: aktiv ? 700 : 500,
          color: "var(--fg)",
          background: aktiv ? "var(--warn-tint)" : "var(--surface-2)",
          border: aktiv ? "2px solid var(--warn)" : "1px solid var(--border)",
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {art}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="einsatzart-wahl-title"
      style={{ position: "fixed", inset: 0, zIndex: 2600, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div
        style={{
          position: "relative",
          width: "min(560px, 100%)",
          maxHeight: "calc(100vh - 24px)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 6,
          boxShadow: "var(--glass-shadow-1)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <header>
          <h2 id="einsatzart-wahl-title" style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>
            {automatisch ? "Einsatzart bestätigen" : "Einsatzart wählen"}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.45, color: "var(--fg-2)" }}>
            {automatisch
              ? "Die Einsatzart wurde aus dem Alarm vorgeschlagen. Bitte prüfen — sie bestimmt die Berichtsnummer."
              : "Vor dem Abschluss bitte die Einsatzart angeben — sie bestimmt die Berichtsnummer (B = Brand, T = Technisch)."}
          </p>
        </header>

        <section>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: "var(--fg-3)" }}>
            <Flame size={16} /> BRAND (B26-…)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
            {BRAND_ARTEN.map(kachel)}
          </div>
        </section>

        <section>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: "var(--fg-3)" }}>
            <Wrench size={16} /> TECHNISCH (T26-…)
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
            {TECHNISCH_ARTEN.map(kachel)}
          </div>
        </section>

        {error ? (
          <div
            role="alert"
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 15,
              padding: "8px 12px",
              borderRadius: 4,
              background: "var(--red-tint)",
              color: "var(--red)",
              border: "1px solid var(--red-border)",
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{error}</div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          {kategorie ? (
            <span style={{ marginRight: "auto", fontSize: 14, color: "var(--fg-3)" }}>
              {kategorie === "brand" ? "Brandbericht (B-Nummer)" : "Technischer Bericht (T-Nummer)"}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onAbbruch}
            disabled={busy}
            style={{
              background: "transparent",
              border: "1px solid var(--border-strong)",
              color: "var(--fg)",
              padding: "10px 16px",
              borderRadius: 4,
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => auswahl && onWahl(auswahl)}
            disabled={busy || !auswahl}
            style={{
              background: "var(--red)",
              border: 0,
              color: "#fff",
              padding: "10px 18px",
              borderRadius: 4,
              fontWeight: 700,
              cursor: busy ? "wait" : auswahl ? "pointer" : "not-allowed",
              opacity: busy || !auswahl ? 0.55 : 1,
            }}
          >
            {busy ? "Speichert …" : "Weiter zum Abschluss"}
          </button>
        </div>
      </div>
    </div>
  );
}
