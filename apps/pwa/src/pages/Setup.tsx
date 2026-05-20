import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { db } from "../db/pouch";

interface Props {
  onSetupDone: (fahrzeugId: FahrzeugId) => void;
}

/**
 * Erstes Setup nach Installation — wählt das Fahrzeug, auf dem das
 * Tablet verlastet ist. Im Design-Stil mit .vehicle-row /.vehicle-chip
 * sowie der HotDoc-Branding-Karte oben.
 */
export function Setup({ onSetupDone }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectFahrzeug(fId: FahrzeugId) {
    setBusy(true);
    setError(null);
    try {
      await db.put({
        _id: "fahrzeug:self",
        type: "fahrzeug-config",
        fahrzeugId: fId,
        tabletDeviceId: crypto.randomUUID(),
        setupAm: new Date().toISOString(),
      });
      onSetupDone(fId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ minHeight: "100vh", maxWidth: 560, margin: "0 auto", paddingTop: 64 }}>
      <header style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <span
          className="applogo"
          aria-hidden
          style={{ width: 72, height: 72, borderRadius: 20 }}
        >
          <svg viewBox="0 0 24 24" fill="none" width={42} height={42}>
            <path
              d="M12 2c.5 4 4 5.5 4 9.5 0 3.6-1.8 6.5-4 6.5s-4-2.9-4-6.5C8 9 9.5 8 12 2z"
              fill="#E63946"
            />
            <path
              d="M12 7c0 3 2 4 2 6.5s-1 3.5-2 3.5-2-1-2-3.5S12 10 12 7z"
              fill="#FFB703"
            />
            <circle cx="12" cy="20.5" r="1.8" fill="#FFB703" />
          </svg>
        </span>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg)" }}>
          HotDoc
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--fg-2)",
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          Erstes Setup — wähle das Fahrzeug, auf dem dieses Tablet fix verlastet ist.
          Die Einstellung lässt sich später durch einen Funktionär ändern.
        </p>
      </header>

      <section className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div className="card-title">Fahrzeugauswahl</div>
          <span className="card-meta">{FAHRZEUG_IDS.length} Fahrzeuge</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAHRZEUG_IDS.map((id) => {
            const f = FAHRZEUGE[id];
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => selectFahrzeug(id)}
                className="person filled"
                style={{ cursor: "pointer" }}
              >
                <span
                  className="avatar"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    background: "var(--fg)",
                    color: "var(--bg)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {shortCode(id)}
                </span>
                <div className="name" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
                  <span>{f.funkrufname}</span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--fg-3)",
                    }}
                  >
                    {f.bezeichnung} · Besatzung {f.besatzung.typ}
                  </span>
                </div>
                <div className="chev">
                  <ChevronRight size={14} strokeWidth={2.5} />
                </div>
              </button>
            );
          })}
        </div>

        {error ? (
          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--red-tint)",
              color: "var(--red)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        ) : null}
      </section>

      <p
        style={{
          marginTop: 16,
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--fg-3)",
        }}
      >
        Diese Einstellung kann später nur durch einen Funktionär geändert werden.
      </p>
    </main>
  );
}

function shortCode(id: FahrzeugId): string {
  switch (id) {
    case "kdo":        return "KDO";
    case "tlf-a-4000": return "TANK";
    case "lfa-b":      return "LFB-A2";
    case "mtf":        return "MTF";
    case "zentrale":   return "FLORIAN";
  }
}
