import { FAHRZEUGE, FAHRZEUG_IDS, type FahrzeugId } from "@hotdoc/shared";
import { ChevronRight, KeyRound, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { db } from "../db/pouch";
import { BrandLogo } from "../components/BrandLogo";

interface Props {
  onSetupDone: (fahrzeugId: FahrzeugId) => void;
}

const PIN_TOKEN_KEY = "hotdoc.tabletToken";

/**
 * Erstes Setup nach Installation:
 * 1. Fahrzeug wählen
 * 2. PIN eingeben (4-6 Ziffern, Default "1234" — Funktionär ändert in
 *    Verwaltung/Stammdaten)
 * 3. Backend registriert das Tablet, gibt JWT zurück → wird in
 *    localStorage gespeichert für nachfolgende API-Calls.
 *
 * Fallback wenn das Backend nicht erreichbar ist (z. B. erstes Setup
 * ohne Netz): Tablet bleibt offline-tauglich, registriert sich beim
 * ersten Online-Sync nach.
 */
export function Setup({ onSetupDone }: Props) {
  const [stage, setStage] = useState<"vehicle" | "pin">("vehicle");
  const [selectedFzg, setSelectedFzg] = useState<FahrzeugId | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectFahrzeug(fId: FahrzeugId) {
    setSelectedFzg(fId);
    setStage("pin");
    setError(null);
    setPin("");
  }

  async function submitPin() {
    if (!selectedFzg) return;
    if (!/^\d{4,6}$/.test(pin)) {
      setError("PIN muss 4-6 Ziffern haben.");
      return;
    }
    setBusy(true);
    setError(null);
    const deviceId = crypto.randomUUID();
    try {
      const res = await fetch("/api/auth/tablet/pin-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fahrzeugId: selectedFzg, pin, deviceId }),
      });
      if (res.status === 401) {
        setError("PIN falsch — bitte beim Funktionär nachfragen.");
        setBusy(false);
        return;
      }
      if (!res.ok) {
        setError(`Anmeldung fehlgeschlagen (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      const auth = (await res.json()) as { token: string };
      localStorage.setItem(PIN_TOKEN_KEY, auth.token);
    } catch {
      // Offline-Fallback: PIN-Check beim ersten Sync nachholen
      console.warn("[setup] Backend nicht erreichbar — Tablet läuft erstmal offline");
    }
    try {
      await db.put({
        _id: "fahrzeug:self",
        type: "fahrzeug-config",
        fahrzeugId: selectedFzg,
        tabletDeviceId: deviceId,
        setupAm: new Date().toISOString(),
      });
      onSetupDone(selectedFzg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="page" style={{ minHeight: "100vh", maxWidth: 560, margin: "0 auto", paddingTop: 64 }}>
      <header style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <BrandLogo variant="full" size={64} />
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--fg)", marginTop: 8 }}>
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

      {stage === "pin" && selectedFzg ? (
        <section className="card" style={{ marginTop: 24 }}>
          <div className="card-head">
            <div className="card-title">
              <KeyRound size={18} />
              PIN für {FAHRZEUGE[selectedFzg].funkrufname}
            </div>
            <span className="card-meta">{FAHRZEUGE[selectedFzg].bezeichnung}</span>
          </div>
          <p style={{ fontSize: 14, color: "var(--fg-2)", marginBottom: 16 }}>
            Gib die vom Funktionär ausgegebene PIN ein (4–6 Ziffern). Default {" "}
            <strong>1234</strong> wenn noch keine eigene gesetzt wurde.
          </p>
          <input
            type="tel"
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="• • • •"
            className="input num"
            autoFocus
            style={{
              textAlign: "center",
              letterSpacing: "0.5em",
              fontSize: 28,
              fontWeight: 700,
              padding: "18px",
            }}
          />
          {error ? (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--red-tint)",
                color: "var(--red)",
                fontSize: 13,
                fontWeight: 500,
                border: "1px solid var(--red-border)",
              }}
            >
              {error}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => {
                setStage("vehicle");
                setError(null);
              }}
              className="themetoggle"
              style={{ width: "auto", padding: "0 14px", gap: 8, display: "flex", alignItems: "center" }}
            >
              <ArrowLeft size={14} /> Zurück
            </button>
            <button
              type="button"
              onClick={() => void submitPin()}
              disabled={busy || pin.length < 4}
              className="cta"
              style={{ flex: 1, padding: "14px 18px", fontSize: 15 }}
            >
              {busy ? "Anmelden …" : "Tablet registrieren"}
            </button>
          </div>
        </section>
      ) : (
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

        {error && stage === "vehicle" ? (
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
      )}

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
    case "lfa-b":      return "LFA-B";
    case "mtf":        return "MTF";
    case "zentrale":   return "FLORIAN";
  }
}
